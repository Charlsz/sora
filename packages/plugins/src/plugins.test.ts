import { describe, expect, test } from "bun:test";
import {
  createDefaultPluginRegistry,
  redactSecret,
} from "../src/index.ts";

describe("plugins", () => {
  test("default registry lists github and composio", () => {
    const registry = createDefaultPluginRegistry();
    const ids = registry.list().map((p) => p.id).sort();
    expect(ids).toEqual(["composio", "github"]);
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
    expect(statuses.every((s) => s.configured)).toBe(true);
  });

  test("github tools appear only when configured", () => {
    const registry = createDefaultPluginRegistry();
    expect(registry.collectTools({ providers: {} }).length).toBe(0);
    const tools = registry.collectTools({
      providers: { github: { apiKey: "ghp_x" } },
    });
    expect(tools.map((t) => t.name)).toContain("github_list_repos");
  });

  test("redactSecret masks values", () => {
    expect(redactSecret("abcdefghij")).toBe("abc…ghij");
    expect(redactSecret(undefined)).toBeNull();
  });
});
