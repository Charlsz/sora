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
 * Depth-limited and cycle-safe via an ancestor agent-id chain.
 */
export class DelegationService {
  readonly router = new AgentRouter();
  #agents: AgentStore;
  #runner: AgentRunner;
  #events: EventBus;
  #maxDepth: number;
  #depth = 0;
  #chain: string[] = [];

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

    const excludeAgentIds = [...new Set([...this.#chain, request.fromAgentId])];

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
      excludeAgentIds,
      prefer: request.prefer,
    });

    if (!match) {
      throw new Error(
        `No suitable agent found for task: ${request.task}`,
      );
    }

    if (excludeAgentIds.includes(match.agent.id)) {
      throw new Error(
        `Delegation cycle rejected: ${request.fromAgentSlug} → ${match.agent.slug}`,
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
    this.#chain.push(request.fromAgentId);
    let run: RunAgentResult;
    try {
      run = await this.#runner.run({
        agent: target.slug,
        prompt: request.task,
      });
    } finally {
      this.#chain.pop();
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
