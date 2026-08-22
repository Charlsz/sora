export type ProtocolMessageType =
  | "message"
  | "task"
  | "delegation"
  | "result"
  | "event"
  | "notification"
  | "request";

export type AgentEnvelope = {
  id: string;
  type: ProtocolMessageType;
  from: string;
  to: string;
  payload: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type DelegationRequest = {
  fromAgentId: string;
  fromAgentSlug: string;
  task: string;
  requiredCapabilities?: string[];
  /** Prefer a specific agent slug/name when provided. */
  prefer?: string;
};

export type DelegationResult = {
  envelope: AgentEnvelope;
  toAgentSlug: string;
  reply: string;
  toolCalls: Array<{ name: string; ok: boolean; output: string }>;
};

export function createEnvelopeId(): string {
  return `env_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function createEnvelope(
  input: Omit<AgentEnvelope, "id" | "createdAt"> & { id?: string },
): AgentEnvelope {
  return {
    id: input.id ?? createEnvelopeId(),
    type: input.type,
    from: input.from,
    to: input.to,
    payload: input.payload,
    metadata: input.metadata,
    createdAt: new Date().toISOString(),
  };
}
