import type { EventBus } from "@sora/core";
import type {
  AskHandler,
  PermissionDecision,
  PermissionRequest,
} from "@sora/permissions";

export type PendingPermission = PermissionRequest & {
  requestId: string;
  createdAt: string;
};

/**
 * Bridges PermissionGate "ask" decisions to the HTTP/SSE API so the UI
 * (ApprovalCard) can allow or deny privileged actions.
 */
export class PermissionAskBridge {
  #pending = new Map<
    string,
    {
      resolve: (decision: PermissionDecision) => void;
      request: PermissionRequest;
      createdAt: string;
    }
  >();
  #events?: EventBus;

  constructor(events?: EventBus) {
    this.#events = events;
  }

  setEvents(events: EventBus): void {
    this.#events = events;
  }

  createAskHandler(): AskHandler {
    return async (request) => {
      const requestId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      await this.#events?.emit(
        "permission.pending",
        {
          requestId,
          agentId: request.agentId,
          agentSlug: request.agentSlug,
          action: request.action,
          resource: request.resource,
          detail: request.detail,
          createdAt,
        },
        "permissions",
      );

      return await new Promise<PermissionDecision>((resolve) => {
        this.#pending.set(requestId, { resolve, request, createdAt });
      });
    };
  }

  list(): PendingPermission[] {
    return [...this.#pending.entries()].map(([requestId, entry]) => ({
      requestId,
      ...entry.request,
      createdAt: entry.createdAt,
    }));
  }

  respond(
    requestId: string,
    decision: Extract<PermissionDecision, "allow" | "deny">,
  ): boolean {
    const entry = this.#pending.get(requestId);
    if (!entry) return false;
    this.#pending.delete(requestId);
    entry.resolve(decision);
    return true;
  }
}
