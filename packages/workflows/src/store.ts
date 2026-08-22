import type { SoraDatabase } from "@sora/core";
import type {
  CreateWorkflowInput,
  Workflow,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowTrigger,
} from "./types.ts";

export function slugifyWorkflow(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export class WorkflowStore {
  constructor(private readonly db: SoraDatabase) {}

  create(input: CreateWorkflowInput): Workflow {
    const name = input.name.trim();
    if (!name) throw new Error("Workflow name is required");
    if (!input.agent.trim()) throw new Error("Workflow agent is required");
    if (!input.task.trim()) throw new Error("Workflow task is required");
    validateTrigger(input.trigger);

    const slug = slugifyWorkflow(input.slug ?? name);
    if (!slug) throw new Error("Could not derive workflow slug");
    if (this.getBySlug(slug)) {
      throw new Error(`Workflow "${slug}" already exists`);
    }

    const now = new Date().toISOString();
    const workflow: Workflow = {
      id: `wf_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      slug,
      name,
      description: input.description ?? "",
      agentSlug: input.agent.trim(),
      skill: input.skill?.trim() || undefined,
      task: input.task.trim(),
      trigger: input.trigger,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .query(
        `INSERT INTO workflows (
          id, slug, name, description, agent_slug, skill, task,
          trigger_json, enabled, last_run_at, next_run_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        workflow.id,
        workflow.slug,
        workflow.name,
        workflow.description,
        workflow.agentSlug,
        workflow.skill ?? null,
        workflow.task,
        JSON.stringify(workflow.trigger),
        workflow.enabled ? 1 : 0,
        null,
        null,
        workflow.createdAt,
        workflow.updatedAt,
      );

    return workflow;
  }

  list(): Workflow[] {
    const rows = this.db
      .query(`SELECT * FROM workflows ORDER BY name COLLATE NOCASE ASC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map(rowToWorkflow);
  }

  listEnabled(): Workflow[] {
    return this.list().filter((w) => w.enabled);
  }

  getBySlug(slug: string): Workflow | null {
    const row = this.db
      .query(`SELECT * FROM workflows WHERE slug = ?`)
      .get(slugifyWorkflow(slug)) as Record<string, unknown> | null;
    return row ? rowToWorkflow(row) : null;
  }

  getById(id: string): Workflow | null {
    const row = this.db
      .query(`SELECT * FROM workflows WHERE id = ?`)
      .get(id) as Record<string, unknown> | null;
    return row ? rowToWorkflow(row) : null;
  }

  requireBySlug(slug: string): Workflow {
    const workflow = this.getBySlug(slug);
    if (!workflow) {
      throw new Error(`Workflow "${slug}" not found`);
    }
    return workflow;
  }

  setEnabled(slug: string, enabled: boolean): Workflow {
    const workflow = this.requireBySlug(slug);
    const updatedAt = new Date().toISOString();
    this.db
      .query(
        `UPDATE workflows SET enabled = ?, updated_at = ? WHERE id = ?`,
      )
      .run(enabled ? 1 : 0, updatedAt, workflow.id);
    return { ...workflow, enabled, updatedAt };
  }

  updateSchedule(
    id: string,
    patch: { lastRunAt?: string; nextRunAt?: string | null },
  ): void {
    const updatedAt = new Date().toISOString();
    this.db
      .query(
        `UPDATE workflows
         SET last_run_at = COALESCE(?, last_run_at),
             next_run_at = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.lastRunAt ?? null,
        patch.nextRunAt === undefined ? null : patch.nextRunAt,
        updatedAt,
        id,
      );
  }

  remove(slug: string): void {
    const workflow = this.requireBySlug(slug);
    this.db.query(`DELETE FROM workflows WHERE id = ?`).run(workflow.id);
  }

  createRun(input: {
    workflowId: string;
    triggerType: WorkflowRun["triggerType"];
    triggerPayload?: Record<string, unknown>;
  }): WorkflowRun {
    const run: WorkflowRun = {
      id: `wfr_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      workflowId: input.workflowId,
      status: "running",
      triggerType: input.triggerType,
      triggerPayload: input.triggerPayload,
      startedAt: new Date().toISOString(),
    };

    this.db
      .query(
        `INSERT INTO workflow_runs (
          id, workflow_id, status, trigger_type, trigger_payload_json,
          reply, error, conversation_id, started_at, finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        run.id,
        run.workflowId,
        run.status,
        run.triggerType,
        run.triggerPayload ? JSON.stringify(run.triggerPayload) : null,
        null,
        null,
        null,
        run.startedAt,
        null,
      );

    return run;
  }

  finishRun(
    runId: string,
    result: {
      status: Exclude<WorkflowRunStatus, "running">;
      reply?: string;
      error?: string;
      conversationId?: string;
    },
  ): WorkflowRun {
    const finishedAt = new Date().toISOString();
    this.db
      .query(
        `UPDATE workflow_runs
         SET status = ?, reply = ?, error = ?, conversation_id = ?, finished_at = ?
         WHERE id = ?`,
      )
      .run(
        result.status,
        result.reply ?? null,
        result.error ?? null,
        result.conversationId ?? null,
        finishedAt,
        runId,
      );

    const row = this.db
      .query(`SELECT * FROM workflow_runs WHERE id = ?`)
      .get(runId) as Record<string, unknown>;
    return rowToRun(row);
  }

  listRuns(workflowId: string, limit = 20): WorkflowRun[] {
    const rows = this.db
      .query(
        `SELECT * FROM workflow_runs
         WHERE workflow_id = ?
         ORDER BY started_at DESC
         LIMIT ?`,
      )
      .all(workflowId, limit) as Array<Record<string, unknown>>;
    return rows.map(rowToRun);
  }
}

function validateTrigger(trigger: WorkflowTrigger): void {
  if (trigger.type === "cron") {
    const parts = trigger.expression.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(
        `Cron trigger needs 5 fields, got: ${trigger.expression}`,
      );
    }
  }
  if (trigger.type === "webhook" && !trigger.path.trim()) {
    throw new Error("Webhook trigger requires a path");
  }
  if (trigger.type === "event" && (!trigger.source || !trigger.name)) {
    throw new Error("Event trigger requires source and name");
  }
}

function rowToWorkflow(row: Record<string, unknown>): Workflow {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description ?? ""),
    agentSlug: String(row.agent_slug),
    skill: row.skill ? String(row.skill) : undefined,
    task: String(row.task),
    trigger: JSON.parse(String(row.trigger_json)) as WorkflowTrigger,
    enabled: Boolean(row.enabled),
    lastRunAt: row.last_run_at ? String(row.last_run_at) : undefined,
    nextRunAt: row.next_run_at ? String(row.next_run_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToRun(row: Record<string, unknown>): WorkflowRun {
  return {
    id: String(row.id),
    workflowId: String(row.workflow_id),
    status: String(row.status) as WorkflowRunStatus,
    triggerType: String(row.trigger_type) as WorkflowRun["triggerType"],
    triggerPayload: row.trigger_payload_json
      ? (JSON.parse(String(row.trigger_payload_json)) as Record<string, unknown>)
      : undefined,
    reply: row.reply ? String(row.reply) : undefined,
    error: row.error ? String(row.error) : undefined,
    conversationId: row.conversation_id
      ? String(row.conversation_id)
      : undefined,
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : undefined,
  };
}
