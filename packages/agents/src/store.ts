import { mkdirSync, writeFileSync } from "node:fs";
import type { EventBus, SoraDatabase, SoraPaths } from "@sora/core";
import {
  type Agent,
  type AgentStatus,
  type CreateAgentInput,
  slugify,
} from "./types.ts";

export class AgentStore {
  constructor(
    private readonly db: SoraDatabase,
    private readonly paths: SoraPaths,
    private readonly events: EventBus,
  ) {}

  create(input: CreateAgentInput, defaultModel: string): Agent {
    const name = input.name.trim();
    if (!name) throw new Error("Agent name is required");

    const slug = slugify(input.slug ?? name);
    if (!slug) throw new Error("Could not derive agent slug from name");

    const existing = this.getBySlug(slug);
    if (existing) {
      throw new Error(`Agent "${slug}" already exists`);
    }

    const now = new Date().toISOString();
    const id = `agent_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const tools = (
      input.tools ?? [
        "echo",
        "agent_message",
        "delegate_task",
        "invoke_skill",
        "read_file",
        "write_file",
        "list_dir",
        "delete_file",
        "terminal",
        "http_request",
        "save_memory",
        "search_memory",
      ]
    ).map((name) => ({ name }));
    const skills = (input.skills ?? []).map((name) => ({ name }));
    const capabilities =
      input.capabilities ?? inferCapabilities(name, input.description ?? "");

    const agent: Agent = {
      id,
      slug,
      name,
      description: input.description ?? "",
      instructions:
        input.instructions ??
        defaultInstructions(name, input.description ?? ""),
      model: input.model ?? defaultModel,
      tools,
      skills,
      capabilities,
      memory: { kind: "sqlite", agentId: id },
      status: "idle",
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .query(
        `INSERT INTO agents (
          id, slug, name, description, instructions, model,
          tools_json, skills_json, capabilities_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        agent.id,
        agent.slug,
        agent.name,
        agent.description,
        agent.instructions,
        agent.model,
        JSON.stringify(agent.tools),
        JSON.stringify(agent.skills),
        JSON.stringify(agent.capabilities),
        agent.status,
        agent.createdAt,
        agent.updatedAt,
      );

    const agentPaths = this.paths.agent(agent.slug);
    mkdirSync(agentPaths.workspace, { recursive: true });
    mkdirSync(agentPaths.memory, { recursive: true });
    mkdirSync(agentPaths.skills, { recursive: true });
    writeFileSync(
      agentPaths.config,
      JSON.stringify(
        {
          id: agent.id,
          slug: agent.slug,
          name: agent.name,
          description: agent.description,
          instructions: agent.instructions,
          model: agent.model,
          tools: agent.tools,
          skills: agent.skills,
          capabilities: agent.capabilities,
        },
        null,
        2,
      ) + "\n",
    );

    void this.events.emit(
      "agent.created",
      { agentId: agent.id, slug: agent.slug, name: agent.name },
      "agents",
    );

    return agent;
  }

  list(): Agent[] {
    const rows = this.db
      .query(`SELECT * FROM agents ORDER BY name COLLATE NOCASE ASC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map(rowToAgent);
  }

  getBySlug(slug: string): Agent | null {
    const row = this.db
      .query(`SELECT * FROM agents WHERE slug = ?`)
      .get(slugify(slug)) as Record<string, unknown> | null;
    return row ? rowToAgent(row) : null;
  }

  getById(id: string): Agent | null {
    const row = this.db
      .query(`SELECT * FROM agents WHERE id = ?`)
      .get(id) as Record<string, unknown> | null;
    return row ? rowToAgent(row) : null;
  }

  requireBySlugOrName(ref: string): Agent {
    const bySlug = this.getBySlug(ref);
    if (bySlug) return bySlug;

    const rows = this.db
      .query(`SELECT * FROM agents WHERE lower(name) = lower(?)`)
      .all(ref.trim()) as Array<Record<string, unknown>>;

    if (rows.length === 1) return rowToAgent(rows[0]!);
    if (rows.length > 1) {
      throw new Error(`Multiple agents named "${ref}". Use the slug instead.`);
    }
    throw new Error(`Agent "${ref}" not found. Create it with: sora agent create ${ref}`);
  }

  setStatus(agentId: string, status: AgentStatus): void {
    this.db
      .query(`UPDATE agents SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, new Date().toISOString(), agentId);
  }

  requireBySlug(slug: string): Agent {
    const agent = this.getBySlug(slug);
    if (!agent) {
      throw new Error(`Agent "${slug}" not found`);
    }
    return agent;
  }

  update(
    slug: string,
    patch: Partial<
      Pick<Agent, "name" | "description" | "instructions" | "model">
    >,
  ): Agent {
    const agent = this.requireBySlug(slug);
    const updated: Agent = {
      ...agent,
      name: patch.name?.trim() || agent.name,
      description: patch.description ?? agent.description,
      instructions: patch.instructions ?? agent.instructions,
      model: patch.model ?? agent.model,
      updatedAt: new Date().toISOString(),
    };

    this.db
      .query(
        `UPDATE agents SET name = ?, description = ?, instructions = ?, model = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        updated.name,
        updated.description,
        updated.instructions,
        updated.model,
        updated.updatedAt,
        updated.id,
      );

    const agentPaths = this.paths.agent(updated.slug);
    writeFileSync(
      agentPaths.config,
      JSON.stringify(
        {
          id: updated.id,
          slug: updated.slug,
          name: updated.name,
          description: updated.description,
          instructions: updated.instructions,
          model: updated.model,
          tools: updated.tools,
          skills: updated.skills,
          capabilities: updated.capabilities,
        },
        null,
        2,
      ) + "\n",
    );

    void this.events.emit(
      "agent.updated",
      { agentId: updated.id, slug: updated.slug, name: updated.name },
      "agents",
    );

    return updated;
  }

  delete(slug: string): void {
    const agent = this.requireBySlug(slug);
    this.db.query(`DELETE FROM agents WHERE id = ?`).run(agent.id);
  }
}

function defaultInstructions(name: string, description: string): string {
  const desc = description.trim() || "a specialized Sora agent";
  return [
    `You are ${name}.`,
    `You are ${desc}.`,
    "Be concise, practical, and honest about what you can and cannot do.",
    "Use tools when they help complete the user's request.",
    "When another agent is a better fit, use delegate_task instead of doing their work yourself.",
    "You operate inside the Sora local runtime.",
  ].join(" ");
}

/** Soft defaults from name/description — never a hardcoded task router. */
function inferCapabilities(name: string, description: string): string[] {
  const text = `${name} ${description}`.toLowerCase();
  const caps = new Set<string>();

  if (/\b(dev|engineer|software|code|bun|typescript|backend)\b/.test(text)) {
    for (const c of ["typescript", "bun", "backend", "coding", "filesystem", "terminal"]) {
      caps.add(c);
    }
  }
  if (/\b(klaus|assistant|executive)\b/.test(text)) {
    for (const c of ["assistant", "coordination", "delegation"]) caps.add(c);
  }
  if (/\b(research|researcher|search)\b/.test(text)) {
    for (const c of ["research", "web", "summarization"]) caps.add(c);
  }
  if (/\b(ops|operations|automation)\b/.test(text)) {
    for (const c of ["ops", "automation", "terminal"]) caps.add(c);
  }

  return [...caps];
}

function rowToAgent(row: Record<string, unknown>): Agent {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description ?? ""),
    instructions: String(row.instructions ?? ""),
    model: String(row.model),
    tools: JSON.parse(String(row.tools_json || "[]")),
    skills: JSON.parse(String(row.skills_json || "[]")),
    capabilities: JSON.parse(String(row.capabilities_json || "[]")),
    memory: { kind: "sqlite", agentId: String(row.id) },
    status: String(row.status) as AgentStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
