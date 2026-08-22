import type { EventBus } from "@sora/core";
import {
  AgentRouter,
  createEnvelope,
  type DelegationRequest,
  type DelegationResult,
} from "@sora/protocol";
import type { AgentStore } from "./store.ts";
import type { AgentRunner, RunAgentResult } from "./runner.ts";

export type DelegationServiceOptions = {
  agents: AgentStore;
  runner: AgentRunner;
  events: EventBus;
  maxDepth?: number;
};

/**
 * Routes and executes cross-agent work.
 * Depth-limited to prevent recursive delegation loops.
 */
export class DelegationService {
  readonly router = new AgentRouter();
  #agents: AgentStore;
  #runner: AgentRunner;
  #events: EventBus;
  #maxDepth: number;
  #depth = 0;

  constructor(options: DelegationServiceOptions) {
    this.#agents = options.agents;
    this.#runner = options.runner;
    this.#events = options.events;
    this.#maxDepth = options.maxDepth ?? 3;
  }

  async delegate(request: DelegationRequest): Promise<DelegationResult> {
    if (this.#depth >= this.#maxDepth) {
      throw new Error(
        `Delegation depth limit (${this.#maxDepth}) exceeded`,
      );
    }

    const candidates = this.#agents.list().map((a) => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      description: a.description,
      capabilities: a.capabilities,
    }));

    const match = this.router.route(candidates, {
      task: request.task,
      requiredCapabilities: request.requiredCapabilities,
      excludeAgentIds: [request.fromAgentId],
      prefer: request.prefer,
    });

    if (!match) {
      throw new Error(
        `No suitable agent found for task: ${request.task}`,
      );
    }

    const target = match.agent;
    await this.#events.emit(
      "agent.delegated",
      {
        from: request.fromAgentSlug,
        to: target.slug,
        task: request.task,
        score: match.score,
        reasons: match.reasons,
      },
      "delegation",
    );

    this.#depth += 1;
    let run: RunAgentResult;
    try {
      run = await this.#runner.run({
        agent: target.slug,
        prompt: request.task,
      });
    } finally {
      this.#depth -= 1;
    }

    const envelope = createEnvelope({
      type: "result",
      from: target.slug,
      to: request.fromAgentSlug,
      payload: run.reply,
      metadata: {
        task: request.task,
        toolCalls: run.toolCalls,
        score: match.score,
        reasons: match.reasons,
      },
    });

    return {
      envelope,
      toAgentSlug: target.slug,
      reply: run.reply,
      toolCalls: run.toolCalls,
    };
  }
}
