import type { EventBus } from "@sora/core";
import {
  AUTO_APPROVE_POLICY,
  DEFAULT_AGENT_POLICY,
  type PermissionDecision,
  type PermissionPolicy,
  type PermissionRequest,
  type PermissionResolution,
} from "./types.ts";

export type AskHandler = (
  request: PermissionRequest,
) => Promise<PermissionDecision> | PermissionDecision;

export type PermissionGateOptions = {
  policy?: PermissionPolicy;
  events?: EventBus;
  ask?: AskHandler;
  /** When true, treat "ask" as "allow". Also enabled by SORA_AUTO_APPROVE=1. */
  autoApprove?: boolean;
};

/**
 * Central permission gate. Tools must call check() before privileged work.
 * Auditable via the event bus.
 */
export class PermissionGate {
  readonly policy: PermissionPolicy;
  #events?: EventBus;
  #ask?: AskHandler;
  #autoApprove: boolean;
  #audit: Array<PermissionRequest & PermissionResolution & { at: string }> = [];

  constructor(options: PermissionGateOptions = {}) {
    this.policy = options.policy ?? DEFAULT_AGENT_POLICY;
    this.#events = options.events;
    this.#ask = options.ask;
    this.#autoApprove =
      options.autoApprove ??
      (process.env.SORA_AUTO_APPROVE === "1" ||
        process.env.SORA_AUTO_APPROVE === "true");
  }

  get auditLog() {
    return [...this.#audit];
  }

  /** Replace or clear the interactive ask handler (e.g. API bridge). */
  setAsk(ask?: AskHandler): void {
    this.#ask = ask;
  }

  resolve(action: PermissionRequest["action"]): PermissionResolution {
    const decision = this.policy.actions[action] ?? this.policy.default;
    return {
      decision,
      reason: this.policy.actions[action]
        ? `policy.actions.${action}=${decision}`
        : `policy.default=${decision}`,
    };
  }

  async check(request: PermissionRequest): Promise<PermissionResolution> {
    let resolution = this.resolve(request.action);

    if (resolution.decision === "ask") {
      if (this.#autoApprove) {
        resolution = {
          decision: "allow",
          reason: `${resolution.reason}; auto-approved`,
        };
      } else if (this.#ask) {
        const answer = await this.#ask(request);
        resolution = {
          decision: answer,
          reason: `${resolution.reason}; user=${answer}`,
        };
      } else {
        resolution = {
          decision: "deny",
          reason: `${resolution.reason}; no ask handler (set SORA_AUTO_APPROVE=1 or provide ask handler)`,
        };
      }
    }

    this.#audit.push({
      ...request,
      ...resolution,
      at: new Date().toISOString(),
    });

    await this.#events?.emit(
      "permission.requested",
      {
        agentId: request.agentId,
        agentSlug: request.agentSlug,
        action: request.action,
        resource: request.resource,
        decision: resolution.decision,
        reason: resolution.reason,
      },
      "permissions",
    );

    return resolution;
  }

  async assert(request: PermissionRequest): Promise<void> {
    const resolution = await this.check(request);
    if (resolution.decision !== "allow") {
      throw new Error(
        `Permission denied: ${request.action} on ${request.resource} (${resolution.reason})`,
      );
    }
  }
}

export function createPermissionGate(
  options: PermissionGateOptions = {},
): PermissionGate {
  return new PermissionGate(options);
}

export { AUTO_APPROVE_POLICY, DEFAULT_AGENT_POLICY };
