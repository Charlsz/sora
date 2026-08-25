import type { SoraDatabase } from "@sora/core";

export type AgentInboxMessage = {
  id: string;
  toAgentId: string;
  fromAgentId: string;
  fromAgentSlug: string;
  content: string;
  deliver: "queue" | "run";
  read: boolean;
  createdAt: string;
};

export class AgentInboxStore {
  constructor(private readonly db: SoraDatabase) {}

  send(input: {
    toAgentId: string;
    fromAgentId: string;
    fromAgentSlug: string;
    content: string;
    deliver?: "queue" | "run";
  }): AgentInboxMessage {
    const id = `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const record: AgentInboxMessage = {
      id,
      toAgentId: input.toAgentId,
      fromAgentId: input.fromAgentId,
      fromAgentSlug: input.fromAgentSlug,
      content: input.content.slice(0, 8000),
      deliver: input.deliver ?? "queue",
      read: false,
      createdAt: new Date().toISOString(),
    };
    this.db
      .query(
        `INSERT INTO agent_inbox (id, to_agent_id, from_agent_id, from_agent_slug, content, deliver, read, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      )
      .run(
        record.id,
        record.toAgentId,
        record.fromAgentId,
        record.fromAgentSlug,
        record.content,
        record.deliver,
        record.createdAt,
      );
    return record;
  }

  listUnread(agentId: string, limit = 20): AgentInboxMessage[] {
    const rows = this.db
      .query(
        `SELECT * FROM agent_inbox WHERE to_agent_id = ? AND read = 0 ORDER BY created_at ASC LIMIT ?`,
      )
      .all(agentId, limit) as Array<Record<string, unknown>>;
    return rows.map(rowToInbox);
  }

  markRead(ids: string[]): void {
    if (!ids.length) return;
    const placeholders = ids.map(() => "?").join(", ");
    this.db
      .query(`UPDATE agent_inbox SET read = 1 WHERE id IN (${placeholders})`)
      .run(...ids);
  }

  pendingRunRequests(agentId: string): AgentInboxMessage[] {
    return this.listUnread(agentId).filter((m) => m.deliver === "run");
  }
}

function rowToInbox(row: Record<string, unknown>): AgentInboxMessage {
  return {
    id: String(row.id),
    toAgentId: String(row.to_agent_id),
    fromAgentId: String(row.from_agent_id),
    fromAgentSlug: String(row.from_agent_slug),
    content: String(row.content),
    deliver: String(row.deliver) === "run" ? "run" : "queue",
    read: Boolean(row.read),
    createdAt: String(row.created_at),
  };
}
