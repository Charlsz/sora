import { describe, expect, test } from "bun:test";
import { createBuiltinToolRegistry } from "../src/index.ts";

describe("tools", () => {
  test("builtin registry includes echo and agent_message", async () => {
    const registry = createBuiltinToolRegistry();
    expect(registry.list().map((t) => t.name).sort()).toEqual([
      "agent_message",
      "delegate_task",
      "delete_file",
      "echo",
      "http_request",
      "invoke_skill",
      "list_dir",
      "read_file",
      "terminal",
      "write_file",
    ]);

    const result = await registry.get("echo").execute(
      { text: "ping" },
      {
        agentId: "a1",
        agentSlug: "dev",
        workspacePath: "/tmp",
      },
    );
    expect(result.ok).toBe(true);
    expect(result.output).toBe("ping");
  });
});
