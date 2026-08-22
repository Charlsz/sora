import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { Skill, SkillManifest } from "./types.ts";

export class SkillLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillLoadError";
  }
}

/** Load a single skill directory (manifest.json + skill.md). */
export function loadSkill(dir: string): Skill {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new SkillLoadError(`Skill path is not a directory: ${dir}`);
  }

  const manifestPath = join(dir, "manifest.json");
  const instructionsPath = join(dir, "skill.md");

  if (!existsSync(manifestPath)) {
    throw new SkillLoadError(`Missing manifest.json in ${dir}`);
  }
  if (!existsSync(instructionsPath)) {
    throw new SkillLoadError(`Missing skill.md in ${dir}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new SkillLoadError(
      `Invalid manifest.json in ${dir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const manifest = validateManifest(raw, dir);
  const instructions = readFileSync(instructionsPath, "utf8").trim();
  if (!instructions) {
    throw new SkillLoadError(`skill.md is empty in ${dir}`);
  }

  const id = slugifySkillName(manifest.name);
  return {
    id,
    name: manifest.name,
    description: manifest.description,
    instructions,
    tools: manifest.tools,
    path: dir,
    version: manifest.version,
    tags: manifest.tags,
  };
}

/** Discover skill directories under a root (one level deep). */
export function discoverSkills(root: string): Skill[] {
  if (!existsSync(root)) return [];
  if (!statSync(root).isDirectory()) {
    throw new SkillLoadError(`Skills root is not a directory: ${root}`);
  }

  const skills: Skill[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (!statSync(full).isDirectory()) continue;
    // Skip hidden dirs
    if (entry.startsWith(".")) continue;
    try {
      skills.push(loadSkill(full));
    } catch (error) {
      if (error instanceof SkillLoadError) {
        // Skip invalid entries during discovery; callers can load explicitly.
        continue;
      }
      throw error;
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function validateManifest(raw: unknown, dir: string): SkillManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SkillLoadError(`manifest.json must be an object in ${dir}`);
  }
  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  const description =
    typeof obj.description === "string" ? obj.description.trim() : "";

  if (!name) {
    throw new SkillLoadError(`manifest.json missing name in ${dir}`);
  }
  if (!description) {
    throw new SkillLoadError(`manifest.json missing description in ${dir}`);
  }
  if (!Array.isArray(obj.tools) || !obj.tools.every((t) => typeof t === "string")) {
    throw new SkillLoadError(
      `manifest.json tools must be a string array in ${dir}`,
    );
  }
  if (obj.tools.length === 0) {
    throw new SkillLoadError(`manifest.json tools must not be empty in ${dir}`);
  }

  const version = typeof obj.version === "string" ? obj.version : undefined;
  const tags = Array.isArray(obj.tags)
    ? obj.tags.filter((t): t is string => typeof t === "string")
    : undefined;

  return {
    name,
    description,
    version,
    tools: obj.tools.map((t) => String(t).trim()).filter(Boolean),
    tags,
  };
}

export function slugifySkillName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function skillDirName(skill: Skill): string {
  return basename(skill.path);
}
