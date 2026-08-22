import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { basename, join } from "node:path";
import { discoverSkills, loadSkill, SkillLoadError, slugifySkillName } from "./loader.ts";
import type { Skill, SkillInvocation } from "./types.ts";

export type SkillRegistryOptions = {
  /** Primary installed-skills directory (usually ~/.sora/skills). */
  skillsDir: string;
  /** Extra discovery roots (e.g. repo examples). */
  extraRoots?: string[];
};

/**
 * Shared skill registry — not owned by any single agent.
 * Discover/load from disk; register in-memory; install/remove under skillsDir.
 */
export class SkillRegistry {
  readonly skillsDir: string;
  #extraRoots: string[];
  #skills = new Map<string, Skill>();

  constructor(options: SkillRegistryOptions) {
    this.skillsDir = options.skillsDir;
    this.#extraRoots = options.extraRoots ?? [];
    mkdirSync(this.skillsDir, { recursive: true });
  }

  /** Scan skillsDir + extra roots and register all valid skills. */
  discover(): Skill[] {
    const roots = [this.skillsDir, ...this.#extraRoots];
    const found: Skill[] = [];
    for (const root of roots) {
      for (const skill of discoverSkills(root)) {
        this.register(skill);
        found.push(skill);
      }
    }
    return this.list();
  }

  load(path: string): Skill {
    const skill = loadSkill(path);
    this.register(skill);
    return skill;
  }

  register(skill: Skill): void {
    this.#skills.set(skill.id, skill);
  }

  get(nameOrId: string): Skill {
    const key = slugifySkillName(nameOrId);
    const skill = this.#skills.get(key) ?? this.#skills.get(nameOrId);
    if (!skill) {
      throw new SkillLoadError(
        `Skill "${nameOrId}" not found. Installed: ${this.list()
          .map((s) => s.id)
          .join(", ") || "(none)"}`,
      );
    }
    return skill;
  }

  has(nameOrId: string): boolean {
    const key = slugifySkillName(nameOrId);
    return this.#skills.has(key) || this.#skills.has(nameOrId);
  }

  list(): Skill[] {
    return [...this.#skills.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  remove(nameOrId: string): void {
    const skill = this.get(nameOrId);
    this.#skills.delete(skill.id);

    // Only delete from disk if it lives under the installed skills dir
    const installedPath = join(this.skillsDir, skill.id);
    if (
      existsSync(installedPath) &&
      normalizePath(skill.path) === normalizePath(installedPath)
    ) {
      rmSync(installedPath, { recursive: true, force: true });
    }
  }

  /**
   * Copy a skill directory into the shared skills home and register it.
   * Source can be any valid skill folder.
   */
  install(sourcePath: string): Skill {
    const loaded = loadSkill(sourcePath);
    const target = join(this.skillsDir, loaded.id);
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
    }
    mkdirSync(this.skillsDir, { recursive: true });
    cpSync(sourcePath, target, { recursive: true });
    const installed = loadSkill(target);
    this.register(installed);
    return installed;
  }

  /**
   * Prepare a skill for execution inside an agent's existing run context.
   * Does not create a second agent runtime.
   */
  prepareInvocation(input: {
    skillName: string;
    agentToolNames: string[];
  }): SkillInvocation {
    const skill = this.get(input.skillName);
    const agentTools = new Set(input.agentToolNames);
    const missing = skill.tools.filter((t) => !agentTools.has(t));
    if (missing.length) {
      throw new SkillLoadError(
        `Skill "${skill.id}" requires tools not available to this agent: ${missing.join(", ")}`,
      );
    }

    const allowedTools = skill.tools.filter((t) => agentTools.has(t));
    const promptFragment = [
      `## Active skill: ${skill.name}`,
      skill.description,
      "",
      skill.instructions,
      "",
      `While this skill is active, prefer these tools: ${allowedTools.join(", ")}.`,
      "Respect PermissionGate decisions. Do not attempt to bypass workspace or permission boundaries.",
    ].join("\n");

    return { skill, allowedTools, promptFragment };
  }
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

export function parseSkillSlashCommand(
  prompt: string,
): { skillName: string; rest: string } | null {
  const match = /^\/([a-zA-Z][\w-]*)(?:\s+([\s\S]*))?$/.exec(prompt.trim());
  if (!match) return null;
  return {
    skillName: match[1]!,
    rest: (match[2] ?? "").trim(),
  };
}

/** Resolve display name for a path being installed. */
export function suggestSkillIdFromPath(path: string): string {
  return slugifySkillName(basename(path));
}
