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
});
