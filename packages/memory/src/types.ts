export type MemoryKind = "note" | "fact" | "summary" | "preference";

export type MemoryRecord = {
  id: string;
  agentId: string;
  kind: MemoryKind;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type Conversation = {
  id: string;
  agentId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export interface MemoryStore {
  save(input: {
    agentId: string;
    content: string;
    kind?: MemoryKind;
    metadata?: Record<string, unknown>;
  }): Promise<MemoryRecord>;

  search(input: {
    agentId: string;
    query: string;
    limit?: number;
  }): Promise<MemoryRecord[]>;

  retrieve(input: {
    agentId: string;
    limit?: number;
  }): Promise<MemoryRecord[]>;
}

export interface ConversationStore {
  create(agentId: string, title?: string): Promise<Conversation>;
  get(id: string): Promise<Conversation | null>;
  listForAgent(agentId: string): Promise<Conversation[]>;
  appendMessage(
    conversationId: string,
    message: Omit<ConversationMessage, "id" | "conversationId" | "createdAt"> & {
      id?: string;
    },
  ): Promise<ConversationMessage>;
  listMessages(conversationId: string, limit?: number): Promise<ConversationMessage[]>;
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
