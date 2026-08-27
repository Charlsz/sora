import { mkdirSync, writeFileSync } from "node:fs";
import type { EventBus, SoraDatabase, SoraPaths } from "@sora/core";
import { isReservedTeammateName, pickTeammateName } from "./names.ts";
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
    const taken = this.list().map((a) => a.name);
    let name = (input.name ?? "").trim();
    if (!name) name = pickTeammateName(taken);
    if (isReservedTeammateName(name)) {
      throw new Error(
        `"${name}" is reserved for the app. Pick a teammate name instead.`,
      );
    }

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
        "browser_navigate",
        "schedule_routine",
        "list_routines",
        "browser_click",
        "browser_type",
        "browser_screenshot",
        "browser_close",
        "save_memory",
        "search_memory",
      ]
    ).map((name) => ({ name }));
    const skills = (input.skills ?? []).map((name) => ({ name }));
    const capabilities =
      input.capabilities ?? inferCapabilities(name, input.description ?? "");

    const accentColor = normalizeAccentColor(input.accentColor);

    const agent: Agent = {
      id,
      slug,
      name,
      description: input.description ?? "",
      instructions:
        input.instructions ??
        defaultInstructions(name, input.description ?? ""),
      model: input.model ?? defaultModel,
      accentColor,
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
          id, slug, name, description, instructions, model, accent_color,
          tools_json, skills_json, capabilities_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        agent.id,
        agent.slug,
        agent.name,
        agent.description,
        agent.instructions,
        agent.model,
        agent.accentColor,
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
          accentColor: agent.accentColor,
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
      Pick<
        Agent,
        "name" | "description" | "instructions" | "model" | "accentColor"
      >
    >,
  ): Agent {
    const agent = this.requireBySlug(slug);
    const nextName = patch.name?.trim() || agent.name;
    if (isReservedTeammateName(nextName)) {
      throw new Error(
        `"${nextName}" is reserved for the app. Pick a teammate name instead.`,
      );
    }
    const updated: Agent = {
      ...agent,
      name: nextName,
      description: patch.description ?? agent.description,
      instructions: patch.instructions ?? agent.instructions,
      model: patch.model ?? agent.model,
      accentColor:
        patch.accentColor !== undefined
          ? normalizeAccentColor(patch.accentColor)
          : agent.accentColor,
      updatedAt: new Date().toISOString(),
    };

    this.db
      .query(
        `UPDATE agents SET name = ?, description = ?, instructions = ?, model = ?, accent_color = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        updated.name,
        updated.description,
        updated.instructions,
        updated.model,
        updated.accentColor,
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
          accentColor: updated.accentColor,
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
  const role = description.trim() || "an AI teammate";
  return [
    `You are ${name}, ${role}.`,
    "You work as a teammate alongside the user’s other bots.",
    "You have a computer (files, terminal, browser) and can use the internet.",
    "For web research or APIs, use http_request or browser_navigate on your computer.",
    "For Gmail, Slack, calendars, X, and other signed-in apps, use Composio tools when available (composio_list_connections, composio_execute).",
    "Never treat those apps as teammates — do not use delegate_task to connect them.",
    "Never ask the user to paste passwords, API keys, or account login credentials into chat.",
    "If a login is needed on the computer, ask them to Take control and type it themselves.",
    "When another teammate should do the work, use delegate_task or agent_message.",
    "Be concise, practical, and honest. Prefer doing the work over saying you cannot.",
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

function normalizeAccentColor(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const a = raw[1]!;
    const b = raw[2]!;
    const c = raw[3]!;
    return `#${a}${a}${b}${b}${c}${c}`.toUpperCase();
  }
  throw new Error("accentColor must be a hex color like #8B6BC9");
}

function rowToAgent(row: Record<string, unknown>): Agent {
  const accentRaw = row.accent_color;
  let accentColor: string | null = null;
  if (accentRaw != null && String(accentRaw).trim()) {
    try {
      accentColor = normalizeAccentColor(String(accentRaw));
    } catch {
      accentColor = null;
    }
  }
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description ?? ""),
    instructions: String(row.instructions ?? ""),
    model: String(row.model),
    accentColor,
    tools: JSON.parse(String(row.tools_json || "[]")),
    skills: JSON.parse(String(row.skills_json || "[]")),
    capabilities: JSON.parse(String(row.capabilities_json || "[]")),
    memory: { kind: "sqlite", agentId: String(row.id) },
    status: String(row.status) as AgentStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
