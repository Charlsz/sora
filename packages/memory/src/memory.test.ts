import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@sora/core";
import { SqliteMemoryStore } from "../src/sqlite.ts";

describe("memory store", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("save search retrieve round-trip", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sora-mem-"));
    dirs.push(dir);
    mkdirSync(join(dir, "database"), { recursive: true });
    const db = openDatabase(join(dir, "database", "sora.sqlite"));
    db.query(
      `INSERT INTO agents (id, slug, name, description, instructions, model, tools_json, skills_json, capabilities_json, status, created_at, updated_at)
       VALUES (?, ?, ?, '', '', 'mock:echo', '[]', '[]', '[]', 'idle', ?, ?)`,
    ).run(
      "agent_1",
      "test",
      "Test",
      new Date().toISOString(),
      new Date().toISOString(),
    );
    const store = new SqliteMemoryStore(db);

    await store.save({
      agentId: "agent_1",
      content: "User prefers dark mode",
      kind: "preference",
    });
    const hits = await store.search({
      agentId: "agent_1",
      query: "dark",
      limit: 5,
    });
    expect(hits.length).toBe(1);
    expect(hits[0]!.content).toContain("dark mode");

    const recent = await store.retrieve({ agentId: "agent_1", limit: 3 });
    expect(recent.length).toBe(1);
    db.close();
  });
});
