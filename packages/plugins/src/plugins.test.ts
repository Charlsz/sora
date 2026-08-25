import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDefaultPluginRegistry,
  loadCatalog,
  searchLocal,
  syncCatalog,
} from "../src/index.ts";

describe("botdirectory", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("plugin always exposes catalog tools without credentials", () => {
    const registry = createDefaultPluginRegistry();
    const tools = registry
      .get("botdirectory")
      .tools({ providers: {} })
      .map((t) => t.name);
    expect(tools).toContain("botdirectory_search");
    expect(tools).toContain("botdirectory_sync");
    expect(tools).toContain("botdirectory_publish");
  });

  test("status never includes raw password", () => {
    const registry = createDefaultPluginRegistry();
    const statuses = registry.statusAll({
      providers: {
        botdirectory: {
          apiKey: "super_secret_botdirectory_password",
          username: "sora-test",
        },
      },
    });
    const bd = statuses.find((s) => s.id === "botdirectory");
    const blob = JSON.stringify(bd);
    expect(blob).not.toContain("super_secret_botdirectory_password");
    expect(bd?.configured).toBe(true);
    expect(bd?.hint).toContain("@sora-test");
  });

  test("local search filters cached bots", () => {
    const catalog = loadCatalog(join(tmpdir(), "missing-catalog.json"));
    catalog.bots = {
      "slack-ops": {
        slug: "slack-ops",
        name: "Slack Ops",
        category: "Ops",
        addedAt: "2026-01-01T00:00:00.000Z",
        integrations: ["Slack"],
        prompt: "Summarize Slack standups",
        contributor: "test",
        sourceUrl: null,
        detailUrl: "https://botdirectory.ai/bots/slack-ops/",
      },
      "sales-helper": {
        slug: "sales-helper",
        name: "Sales Helper",
        category: "Sales",
        addedAt: "2026-01-02T00:00:00.000Z",
        integrations: ["Salesforce"],
        prompt: "Tier accounts",
        contributor: "test",
        sourceUrl: null,
        detailUrl: "https://botdirectory.ai/bots/sales-helper/",
      },
    };
    const hits = searchLocal(catalog, { q: "slack", category: "Ops" });
    expect(hits.map((b) => b.slug)).toEqual(["slack-ops"]);
  });

  test("cursor sync writes catalog", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sora-bd-"));
    dirs.push(dir);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "catalog.json");
    const result = await syncCatalog(path, { maxPages: 1, limit: 5 });
    expect(result.total).toBeGreaterThan(0);
    const catalog = loadCatalog(path);
    expect(Object.keys(catalog.bots).length).toBe(result.total);
    expect(catalog.nextCursor).toBeTruthy();
  }, 30_000);
});

describe("plugins registry", () => {
  test("default registry includes botdirectory and mcp", () => {
    const registry = createDefaultPluginRegistry();
    const ids = registry.list().map((p) => p.id).sort();
    expect(ids).toEqual(["botdirectory", "composio", "github", "mcp"]);
  });

  test("status never includes raw secrets", () => {
    const registry = createDefaultPluginRegistry();
    const secrets = {
      providers: {
        github: { apiKey: "ghp_super_secret_token_value" },
        composio: { apiKey: "ak_super_secret_composio" },
      },
    };
    const statuses = registry.statusAll(secrets);
    const blob = JSON.stringify(statuses);
    expect(blob).not.toContain("ghp_super_secret_token_value");
    expect(blob).not.toContain("ak_super_secret_composio");
    expect(statuses.find((s) => s.id === "github")?.configured).toBe(true);
    expect(statuses.find((s) => s.id === "composio")?.configured).toBe(true);
  });

  test("github tools appear only when configured", () => {
    const registry = createDefaultPluginRegistry();
    expect(
      registry
        .collectTools({ providers: {} })
        .filter((t) => t.name.startsWith("github_")).length,
    ).toBe(0);
    const tools = registry.collectTools({
      providers: { github: { apiKey: "ghp_x" } },
    });
    expect(tools.map((t) => t.name)).toContain("github_list_repos");
  });
});
