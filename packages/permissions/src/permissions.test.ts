import { describe, expect, test } from "bun:test";
import { EventBus } from "@sora/core";
import { PermissionGate } from "../src/index.ts";

describe("PermissionGate", () => {
  test("allows fs.read by default policy", async () => {
    const gate = new PermissionGate();
    const result = await gate.check({
      agentId: "a1",
      agentSlug: "dev",
      action: "fs.read",
      resource: "readme.md",
    });
    expect(result.decision).toBe("allow");
  });

  test("denies ask without handler", async () => {
    const gate = new PermissionGate({ autoApprove: false });
    const result = await gate.check({
      agentId: "a1",
      agentSlug: "dev",
      action: "terminal.exec",
      resource: "rm -rf /",
    });
    expect(result.decision).toBe("deny");
  });

  test("auto-approves ask when enabled", async () => {
    const events = new EventBus();
    const seen: string[] = [];
    events.on("permission.requested", (e) => {
      seen.push(String(e.data?.decision));
    });
    const gate = new PermissionGate({ autoApprove: true, events });
    const result = await gate.check({
      agentId: "a1",
      agentSlug: "dev",
      action: "fs.write",
      resource: "out.txt",
    });
    expect(result.decision).toBe("allow");
    expect(seen).toEqual(["allow"]);
  });

  test("per-agent localComputer ask beats category allow", async () => {
    const gate = new PermissionGate({ autoApprove: false });
    gate.setAgentPolicy("a1", {
      default: "deny",
      actions: { "fs.read": "allow" },
      localComputer: "ask",
    });
    const cloud = await gate.check({
      agentId: "a1",
      agentSlug: "dev",
      action: "fs.read",
      resource: "a.txt",
    });
    expect(cloud.decision).toBe("allow");
    const local = await gate.check({
      agentId: "a1",
      agentSlug: "dev",
      action: "fs.read",
      resource: "a.txt",
      detail: { computer: "local" },
    });
    // ask with no handler → deny
    expect(local.decision).toBe("deny");
    expect(local.reason).toContain("localComputer");
  });
});
