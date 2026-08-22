export type SoraEventType =
  | "runtime.started"
  | "runtime.stopped"
  | "agent.created"
  | "agent.updated"
  | "agent.started"
  | "agent.completed"
  | "agent.failed"
  | "agent.message"
  | "agent.tool.started"
  | "agent.tool.completed"
  | "agent.tool.failed"
  | "agent.delegated"
  | "workflow.started"
  | "workflow.triggered"
  | "workflow.step.started"
  | "workflow.step.completed"
  | "workflow.failed"
  | "workflow.completed"
  | "permission.requested"
  | "permission.pending"
  | "log";

export type SoraEvent = {
  id: string;
  type: SoraEventType;
  timestamp: number;
  source?: string;
  data?: Record<string, unknown>;
};

export type EventHandler = (event: SoraEvent) => void | Promise<void>;

let eventSeq = 0;

export function createEventId(): string {
  eventSeq += 1;
  return `evt_${Date.now().toString(36)}_${eventSeq.toString(36)}`;
}

/**
 * In-process pub/sub bus. The runtime emits; CLI/UI/plugins subscribe.
 * No frontend state is mutated here.
 */
export class EventBus {
  #handlers = new Map<SoraEventType | "*", Set<EventHandler>>();

  on(type: SoraEventType | "*", handler: EventHandler): () => void {
    let set = this.#handlers.get(type);
    if (!set) {
      set = new Set();
      this.#handlers.set(type, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  async emit(
    type: SoraEventType,
    data?: Record<string, unknown>,
    source?: string,
  ): Promise<SoraEvent> {
    const event: SoraEvent = {
      id: createEventId(),
      type,
      timestamp: Date.now(),
      source,
      data,
    };

    const specific = this.#handlers.get(type);
    const wildcard = this.#handlers.get("*");
    const handlers = [
      ...(specific ? [...specific] : []),
      ...(wildcard ? [...wildcard] : []),
    ];

    for (const handler of handlers) {
      await handler(event);
    }

    return event;
  }

  clear(): void {
    this.#handlers.clear();
  }
}
