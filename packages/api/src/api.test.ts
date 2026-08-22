import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgent, createSoraServices, initSora } from "@sora/agents";
import { startApiServer, type StartedApiServer } from "../src/index.ts";

describe("api server", () => {
  let home: string;
  let server: StartedApiServer;

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "sora-api-"));
    const { runtime } = initSora({ home });
    runtime.close();
    const services = createSoraServices({
      home,
      permissions: { autoApprove: true },
    });
    await createAgent(services, {
      name: "Klaus",
      description: "Executive assistant",
    });
    server = startApiServer({ services, port: 0 });
  });

  afterAll(() => {
    server.stop();
    rmSync(home, { recursive: true, force: true });
  });

  test("health and agents", async () => {
    const health = await fetch(`${server.url}/api/health`);
    expect(health.ok).toBe(true);
    const agents = await fetch(`${server.url}/api/agents`);
    const list = (await agents.json()) as Array<{ slug: string }>;
    expect(list.some((a) => a.slug === "klaus")).toBe(true);
  });

  test("run agent", async () => {
    const res = await fetch(`${server.url}/api/agents/klaus/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "hello" }),
    });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { reply: string };
    expect(body.reply.toLowerCase()).toContain("hello");
  });

  test("permission respond without bridge", async () => {
    const res = await fetch(`${server.url}/api/permissions/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: "x", decision: "allow" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("api permission ask", () => {
  let home: string;
  let server: StartedApiServer;

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "sora-api-ask-"));
    const { runtime } = initSora({ home });
    runtime.close();
    const services = createSoraServices({
      home,
      permissions: { autoApprove: false },
    });
    const { PermissionAskBridge } = await import("../src/permission-ask.ts");
    const bridge = new PermissionAskBridge(services.runtime.events);
    services.permissions.setAsk(bridge.createAskHandler());
    await createAgent(services, {
      name: "Klaus",
      description: "Executive assistant",
    });
    server = startApiServer({ services, port: 0, permissionAsk: bridge });
  });

  afterAll(() => {
    server.stop();
    rmSync(home, { recursive: true, force: true });
  });

  test("pending list starts empty", async () => {
    const res = await fetch(`${server.url}/api/permissions/pending`);
    expect(res.ok).toBe(true);
    const list = (await res.json()) as unknown[];
    expect(list).toEqual([]);
  });
});
