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

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Bridges PermissionGate "ask" decisions to the HTTP/SSE API so the UI
 * (ApprovalCard) can allow or deny privileged actions.
 *
 * Inspired by OpenMausBot's permission broker: session remembers + timeouts
 * so runs never hang forever.
 */
export class PermissionAskBridge {
  #pending = new Map<
    string,
    {
      resolve: (decision: PermissionDecision) => void;
      request: PermissionRequest;
      createdAt: string;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  /** Session-scoped allow for `${agentId}:${action}` (cleared on process restart). */
  #sessionAllow = new Set<string>();
  #events?: EventBus;
  #timeoutMs: number;

  constructor(events?: EventBus, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.#events = events;
    this.#timeoutMs = timeoutMs;
  }

  setEvents(events: EventBus): void {
    this.#events = events;
  }

  createAskHandler(): AskHandler {
    return async (request) => {
      const sessionKey = `${request.agentId}:${request.action}`;
      if (this.#sessionAllow.has(sessionKey)) {
        return "allow";
      }

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
        const timer = setTimeout(() => {
          if (!this.#pending.has(requestId)) return;
          this.#pending.delete(requestId);
          void this.#events?.emit(
            "permission.requested",
            {
              requestId,
              agentId: request.agentId,
              agentSlug: request.agentSlug,
              action: request.action,
              resource: request.resource,
              decision: "deny",
              reason: "timeout",
            },
            "permissions",
          );
          resolve("deny");
        }, this.#timeoutMs);

        this.#pending.set(requestId, {
          resolve,
          request,
          createdAt,
          timer,
        });
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
    options?: { rememberSession?: boolean },
  ): boolean {
    const entry = this.#pending.get(requestId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.#pending.delete(requestId);
    if (decision === "allow" && options?.rememberSession) {
      this.#sessionAllow.add(`${entry.request.agentId}:${entry.request.action}`);
    }
    entry.resolve(decision);
    return true;
  }

  clearSessionAllows(): void {
    this.#sessionAllow.clear();
  }
}
