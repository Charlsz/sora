import type { SoraDatabase } from "@sora/core";
import {
  createId,
  type Conversation,
  type ConversationMessage,
  type ConversationStore,
  type MemoryKind,
  type MemoryRecord,
  type MemoryStore,
} from "./types.ts";

export class SqliteMemoryStore implements MemoryStore {
  constructor(private readonly db: SoraDatabase) {}

  async save(input: {
    agentId: string;
    content: string;
    kind?: MemoryKind;
    metadata?: Record<string, unknown>;
  }): Promise<MemoryRecord> {
    const record: MemoryRecord = {
      id: createId("mem"),
      agentId: input.agentId,
      kind: input.kind ?? "note",
      content: input.content,
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
    };

    this.db
      .query(
        `INSERT INTO memories (id, agent_id, kind, content, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.agentId,
        record.kind,
        record.content,
        record.metadata ? JSON.stringify(record.metadata) : null,
        record.createdAt,
      );

    return record;
  }

  async search(input: {
    agentId: string;
    query: string;
    limit?: number;
  }): Promise<MemoryRecord[]> {
    const limit = input.limit ?? 20;
    const rows = this.db
      .query(
        `SELECT * FROM memories
         WHERE agent_id = ? AND content LIKE ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(input.agentId, `%${input.query}%`, limit) as Array<Record<string, unknown>>;

    return rows.map(rowToMemory);
  }

  async retrieve(input: {
    agentId: string;
    limit?: number;
  }): Promise<MemoryRecord[]> {
    const limit = input.limit ?? 20;
    const rows = this.db
      .query(
        `SELECT * FROM memories
         WHERE agent_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(input.agentId, limit) as Array<Record<string, unknown>>;

    return rows.map(rowToMemory);
  }
}

export class SqliteConversationStore implements ConversationStore {
  constructor(private readonly db: SoraDatabase) {}

  async create(agentId: string, title = ""): Promise<Conversation> {
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: createId("conv"),
      agentId,
      title,
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .query(
        `INSERT INTO conversations (id, agent_id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        conversation.id,
        conversation.agentId,
        conversation.title,
        conversation.createdAt,
        conversation.updatedAt,
      );

    return conversation;
  }

  async get(id: string): Promise<Conversation | null> {
    const row = this.db
      .query(`SELECT * FROM conversations WHERE id = ?`)
      .get(id) as Record<string, unknown> | null;
    return row ? rowToConversation(row) : null;
  }

  async listForAgent(agentId: string): Promise<Conversation[]> {
    const rows = this.db
      .query(
        `SELECT * FROM conversations WHERE agent_id = ? ORDER BY updated_at DESC`,
      )
      .all(agentId) as Array<Record<string, unknown>>;
    return rows.map(rowToConversation);
  }

  async appendMessage(
    conversationId: string,
    message: Omit<ConversationMessage, "id" | "conversationId" | "createdAt"> & {
      id?: string;
    },
  ): Promise<ConversationMessage> {
    const record: ConversationMessage = {
      id: message.id ?? createId("msg"),
      conversationId,
      role: message.role,
      content: message.content,
      toolName: message.toolName,
      toolCallId: message.toolCallId,
      metadata: message.metadata,
      createdAt: new Date().toISOString(),
    };

    this.db
      .query(
        `INSERT INTO messages
          (id, conversation_id, role, content, tool_name, tool_call_id, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.conversationId,
        record.role,
        record.content,
        record.toolName ?? null,
        record.toolCallId ?? null,
        record.metadata ? JSON.stringify(record.metadata) : null,
        record.createdAt,
      );

    this.db
      .query(`UPDATE conversations SET updated_at = ? WHERE id = ?`)
      .run(record.createdAt, conversationId);

    return record;
  }

  async listMessages(
    conversationId: string,
    limit = 100,
  ): Promise<ConversationMessage[]> {
    const rows = this.db
      .query(
        `SELECT * FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(conversationId, limit) as Array<Record<string, unknown>>;
    return rows.map(rowToMessage);
  }
}

function rowToMemory(row: Record<string, unknown>): MemoryRecord {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    kind: String(row.kind) as MemoryKind,
    content: String(row.content),
    metadata: row.metadata_json
      ? (JSON.parse(String(row.metadata_json)) as Record<string, unknown>)
      : undefined,
    createdAt: String(row.created_at),
  };
}

function rowToConversation(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    title: String(row.title),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToMessage(row: Record<string, unknown>): ConversationMessage {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    role: String(row.role) as ConversationMessage["role"],
    content: String(row.content),
    toolName: row.tool_name ? String(row.tool_name) : undefined,
    toolCallId: row.tool_call_id ? String(row.tool_call_id) : undefined,
    metadata: row.metadata_json
      ? (JSON.parse(String(row.metadata_json)) as Record<string, unknown>)
      : undefined,
    createdAt: String(row.created_at),
  };
}
