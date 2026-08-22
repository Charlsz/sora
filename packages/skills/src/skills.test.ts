import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SkillLoadError,
  SkillRegistry,
  loadSkill,
  parseSkillSlashCommand,
  validateManifest,
} from "../src/index.ts";

function writeSkill(
  root: string,
  name: string,
  opts: {
    description?: string;
    tools?: string[];
    instructions?: string;
    badManifest?: boolean;
    missingMd?: boolean;
  } = {},
) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  if (!opts.badManifest) {
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify(
        {
          name,
          description: opts.description ?? `${name} skill`,
          tools: opts.tools ?? ["list_dir", "read_file", "write_file"],
        },
        null,
        2,
      ),
    );
  } else {
    writeFileSync(join(dir, "manifest.json"), "{ not json");
  }
  if (!opts.missingMd) {
    writeFileSync(
      join(dir, "skill.md"),
      opts.instructions ?? `# ${name}\n\nDo the thing.\n`,
    );
  }
  return dir;
}

describe("skill loader", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "sora-skill-load-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("loads a valid skill", () => {
    const dir = writeSkill(root, "demo");
    const skill = loadSkill(dir);
    expect(skill.id).toBe("demo");
    expect(skill.tools).toContain("list_dir");
    expect(skill.instructions).toContain("Do the thing");
  });

  test("rejects invalid manifests", () => {
    expect(() => validateManifest({}, root)).toThrow(SkillLoadError);
    expect(() =>
      validateManifest({ name: "x", description: "y", tools: [] }, root),
    ).toThrow(/empty/);
    const dir = writeSkill(root, "broken", { badManifest: true });
    expect(() => loadSkill(dir)).toThrow(SkillLoadError);
  });

  test("rejects missing skill.md", () => {
    const dir = writeSkill(root, "nomd", { missingMd: true });
    expect(() => loadSkill(dir)).toThrow(/skill\.md/);
  });
});

describe("SkillRegistry", () => {
  let home: string;
  let registry: SkillRegistry;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "sora-skill-reg-"));
    registry = new SkillRegistry({ skillsDir: join(home, "skills") });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test("discover, register, get, list, remove", () => {
    const source = writeSkill(home, "alpha");
    registry.install(source);
    expect(registry.list().map((s) => s.id)).toContain("alpha");
    expect(registry.get("alpha").description).toContain("alpha");
    registry.remove("alpha");
    expect(registry.has("alpha")).toBe(false);
  });

  test("discover skips invalid entries", () => {
    writeSkill(join(home, "skills"), "good");
    mkdirSync(join(home, "skills", "bad"), { recursive: true });
    writeFileSync(join(home, "skills", "bad", "manifest.json"), "{}");
    const listed = registry.discover();
    expect(listed.map((s) => s.id)).toEqual(["good"]);
  });

  test("prepareInvocation intersects tools and fails on missing", () => {
    const source = writeSkill(home, "review", {
      tools: ["list_dir", "write_file", "terminal"],
    });
    registry.install(source);
    const ok = registry.prepareInvocation({
      skillName: "review",
      agentToolNames: ["list_dir", "write_file", "terminal", "echo"],
    });
    expect(ok.allowedTools).toEqual(["list_dir", "write_file", "terminal"]);
    expect(ok.promptFragment).toContain("Active skill");

    expect(() =>
      registry.prepareInvocation({
        skillName: "review",
        agentToolNames: ["list_dir"],
      }),
    ).toThrow(/not available/);
  });
});

describe("parseSkillSlashCommand", () => {
  test("parses /skill and rest", () => {
    expect(parseSkillSlashCommand("/github-review")).toEqual({
      skillName: "github-review",
      rest: "",
    });
    expect(parseSkillSlashCommand("/github-review focus on tests")).toEqual({
      skillName: "github-review",
      rest: "focus on tests",
    });
    expect(parseSkillSlashCommand("not a slash")).toBeNull();
  });
});
