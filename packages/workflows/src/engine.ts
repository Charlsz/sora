import type { EventBus } from "@sora/core";
import { createDefaultTriggerHandlers } from "./triggers/handlers.ts";
import type { WorkflowStore } from "./store.ts";
import type {
  TriggerContext,
  TriggerHandler,
  TriggerType,
  Workflow,
  WorkflowExecutor,
  WorkflowRun,
} from "./types.ts";

export type WorkflowEngineOptions = {
  store: WorkflowStore;
  executor: WorkflowExecutor;
  events: EventBus;
  triggers?: TriggerHandler[];
};

/**
 * Generic workflow engine.
 * Triggers are pluggable; execution always goes through WorkflowExecutor
 * (agent runner → skills/tools → PermissionGate → computer).
 */
export class WorkflowEngine {
  readonly store: WorkflowStore;
  #executor: WorkflowExecutor;
  #events: EventBus;
  #triggers: Map<TriggerType, TriggerHandler>;
  #timer: ReturnType<typeof setInterval> | null = null;
  #tickMs: number;

  constructor(options: WorkflowEngineOptions & { tickMs?: number }) {
    this.store = options.store;
    this.#executor = options.executor;
    this.#events = options.events;
    this.#triggers = new Map();
    for (const handler of options.triggers ?? createDefaultTriggerHandlers()) {
      this.#triggers.set(handler.type, handler);
    }
    this.#tickMs = options.tickMs ?? 30_000;
  }

  registerTrigger(handler: TriggerHandler): void {
    this.#triggers.set(handler.type, handler);
  }

  /** Run a workflow immediately (manual). */
  async run(
    slug: string,
    payload?: Record<string, unknown>,
  ): Promise<WorkflowRun> {
    const workflow = this.store.requireBySlug(slug);
    return this.#execute(workflow, "manual", {
      ...payload,
      force: true,
      manual: true,
    });
  }

  /**
   * Dispatch an inbound webhook to matching workflows.
   * path is matched against webhook trigger path.
   */
  async handleWebhook(input: {
    path: string;
    secret?: string;
    body?: Record<string, unknown>;
  }): Promise<WorkflowRun[]> {
    const payload = {
      path: input.path,
      secret: input.secret,
      ...(input.body ?? {}),
    };
    const runs: WorkflowRun[] = [];
    for (const workflow of this.store.listEnabled()) {
      if (workflow.trigger.type !== "webhook") continue;
      const handler = this.#triggers.get("webhook");
      if (!handler?.shouldFire(workflow, { now: new Date(), payload })) {
        continue;
      }
      runs.push(await this.#execute(workflow, "webhook", payload));
    }
    return runs;
  }

  /** Evaluate cron (and similar) schedules once. */
  async tick(now = new Date()): Promise<WorkflowRun[]> {
    const runs: WorkflowRun[] = [];
    for (const workflow of this.store.listEnabled()) {
      if (workflow.trigger.type !== "cron") continue;
      const handler = this.#triggers.get("cron");
      if (!handler) continue;

      // Avoid double-firing within the same minute
      if (workflow.lastRunAt) {
        const last = new Date(workflow.lastRunAt);
        if (
          last.getFullYear() === now.getFullYear() &&
          last.getMonth() === now.getMonth() &&
          last.getDate() === now.getDate() &&
          last.getHours() === now.getHours() &&
          last.getMinutes() === now.getMinutes()
        ) {
          continue;
        }
      }

      if (!handler.shouldFire(workflow, { now })) continue;
      runs.push(
        await this.#execute(workflow, "cron", { scheduledAt: now.toISOString() }, now),
      );
    }
    return runs;
  }

  /** Start in-process schedule polling (optional long-running mode). */
  startScheduler(): void {
    if (this.#timer) return;
    // Prime next_run_at for cron workflows
    for (const workflow of this.store.listEnabled()) {
      this.#refreshNextRun(workflow, new Date());
    }
    this.#timer = setInterval(() => {
      void this.tick().catch(() => {
        // Errors are emitted per-run; keep the scheduler alive.
      });
    }, this.#tickMs);
  }

  stopScheduler(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  async #execute(
    workflow: Workflow,
    triggerType: TriggerType,
    payload?: Record<string, unknown>,
    at: Date = new Date(),
  ): Promise<WorkflowRun> {
    await this.#events.emit(
      "workflow.triggered",
      {
        workflowId: workflow.id,
        slug: workflow.slug,
        triggerType,
      },
      "workflows",
    );

    const run = this.store.createRun({
      workflowId: workflow.id,
      triggerType,
      triggerPayload: payload,
    });

    await this.#events.emit(
      "workflow.started",
      {
        workflowId: workflow.id,
        runId: run.id,
        slug: workflow.slug,
        agent: workflow.agentSlug,
        skill: workflow.skill,
      },
      "workflows",
    );

    try {
      await this.#events.emit(
        "workflow.step.started",
        {
          runId: run.id,
          step: "agent.run",
          agent: workflow.agentSlug,
          skill: workflow.skill,
        },
        "workflows",
      );

      const prompt = composePrompt(workflow, payload);
      const result = await this.#executor.run({
        agent: workflow.agentSlug,
        prompt,
        skill: workflow.skill,
      });

      await this.#events.emit(
        "workflow.step.completed",
        {
          runId: run.id,
          step: "agent.run",
          reply: result.reply,
        },
        "workflows",
      );

      const finished = this.store.finishRun(run.id, {
        status: "completed",
        reply: result.reply,
        conversationId: result.conversationId,
      });

      this.store.updateSchedule(workflow.id, {
        lastRunAt: at.toISOString(),
        nextRunAt: this.#computeNextRun(workflow, at)?.toISOString() ?? null,
      });

      await this.#events.emit(
        "workflow.completed",
        {
          workflowId: workflow.id,
          runId: run.id,
          slug: workflow.slug,
          reply: result.reply,
        },
        "workflows",
      );

      return finished;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const finished = this.store.finishRun(run.id, {
        status: "failed",
        error: message,
      });

      this.store.updateSchedule(workflow.id, {
        lastRunAt: at.toISOString(),
        nextRunAt: this.#computeNextRun(workflow, at)?.toISOString() ?? null,
      });

      await this.#events.emit(
        "workflow.failed",
        {
          workflowId: workflow.id,
          runId: run.id,
          slug: workflow.slug,
          error: message,
        },
        "workflows",
      );

      return finished;
    }
  }

  #computeNextRun(workflow: Workflow, from: Date): Date | null {
    const handler = this.#triggers.get(workflow.trigger.type);
    return handler?.nextRunAt?.(workflow, from) ?? null;
  }

  #refreshNextRun(workflow: Workflow, from: Date): void {
    const next = this.#computeNextRun(workflow, from);
    if (next) {
      this.store.updateSchedule(workflow.id, {
        nextRunAt: next.toISOString(),
      });
    }
  }
}

function composePrompt(
  workflow: Workflow,
  payload?: Record<string, unknown>,
): string {
  const parts = [workflow.task];
  if (payload && Object.keys(payload).length) {
    const interesting = { ...payload };
    delete interesting.force;
    delete interesting.manual;
    delete interesting.secret;
    if (Object.keys(interesting).length) {
      parts.push(
        `Trigger payload:\n${JSON.stringify(interesting, null, 2)}`,
      );
    }
  }
  return parts.join("\n\n");
}

// silence unused TriggerContext import usage via re-export if needed
export type { TriggerContext };
