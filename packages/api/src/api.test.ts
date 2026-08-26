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
    services.runtime.updateConfig({
      defaultModel: "mock:echo",
      computer: { provider: "local", failClosed: true },
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

describe("api providers", () => {
  let home: string;
  let server: StartedApiServer;

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "sora-api-prov-"));
    const { runtime } = initSora({ home });
    runtime.close();
    const services = createSoraServices({
      home,
      permissions: { autoApprove: true },
    });
    server = startApiServer({ services, port: 0 });
  });

  afterAll(async () => {
    server.stop();
    for (let i = 0; i < 10; i++) {
      try {
        rmSync(home, { recursive: true, force: true });
        return;
      } catch {
        await Bun.sleep(50);
      }
    }
  });

  test("list providers and set default model to mock", async () => {
    const list = await fetch(`${server.url}/api/providers`);
    expect(list.ok).toBe(true);
    const body = (await list.json()) as {
      providers: Array<{ id: string; configured: boolean }>;
      models: Record<string, Array<{ id: string }>>;
      defaultModel: string;
    };
    expect(body.providers.some((p) => p.id === "openai")).toBe(true);
    expect(body.providers.some((p) => p.id === "anthropic")).toBe(true);
    expect(body.providers.some((p) => p.id === "google")).toBe(true);
    expect(body.providers.some((p) => p.id === "xai")).toBe(true);
    expect(body.providers.some((p) => p.id === "mock" && p.configured)).toBe(
      true,
    );
    expect(body.models.openai?.length).toBeGreaterThan(0);

    const put = await fetch(`${server.url}/api/config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ defaultModel: "mock:echo" }),
    });
    expect(put.ok).toBe(true);

    const testRes = await fetch(`${server.url}/api/providers/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "mock:echo" }),
    });
    expect(testRes.ok).toBe(true);
    const testBody = (await testRes.json()) as { ok: boolean; reply: string };
    expect(testBody.ok).toBe(true);
    expect(testBody.reply.toLowerCase()).toContain("sora-ok");
  });

  test("store provider key without leaking it", async () => {
    const put = await fetch(`${server.url}/api/providers/openai`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "sk-test-secret-value" }),
    });
    expect(put.ok).toBe(true);
    const body = (await put.json()) as {
      providers: Array<{ id: string; configured: boolean; hint: string | null }>;
    };
    const openai = body.providers.find((p) => p.id === "openai");
    expect(openai?.configured).toBe(true);
    expect(JSON.stringify(body)).not.toContain("sk-test-secret-value");
  });

  test("computer status for agent", async () => {
    process.env.SORA_BROWSER = "off";
    const created = await fetch(`${server.url}/api/agents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "BrowserBot" }),
    });
    expect(created.ok).toBe(true);
    const agent = (await created.json()) as { slug: string };
    const res = await fetch(
      `${server.url}/api/agents/${agent.slug}/computer`,
    );
    expect(res.ok).toBe(true);
    const body = (await res.json()) as {
      browser: { backend: string };
      workspaceRoot: string;
    };
    expect(body.workspaceRoot).toContain(agent.slug);
    expect(["playwright", "placeholder"]).toContain(body.browser.backend);
  });

  test("browser install status endpoint", async () => {
    const res = await fetch(`${server.url}/api/browser/status`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as {
      playwrightInstalled: boolean;
      chromiumInstalled: boolean;
      message: string;
    };
    expect(typeof body.playwrightInstalled).toBe("boolean");
    expect(typeof body.message).toBe("string");
  });

  test("workflow enable pause and delete", async () => {
    const agentRes = await fetch(`${server.url}/api/agents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "RoutineBot" }),
    });
    expect(agentRes.ok).toBe(true);
    const agent = (await agentRes.json()) as { slug: string };

    const created = await fetch(`${server.url}/api/workflows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "pause-me",
        agent: agent.slug,
        task: "say hi",
      }),
    });
    expect(created.ok).toBe(true);
    const wf = (await created.json()) as { slug: string; enabled: boolean };
    expect(wf.enabled).toBe(true);

    const paused = await fetch(`${server.url}/api/workflows/${wf.slug}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(paused.ok).toBe(true);
    const pausedBody = (await paused.json()) as { enabled: boolean };
    expect(pausedBody.enabled).toBe(false);

    const deleted = await fetch(`${server.url}/api/workflows/${wf.slug}`, {
      method: "DELETE",
    });
    expect(deleted.ok).toBe(true);
  });

  test("workflow runs history and computer display endpoints", async () => {
    const agentRes = await fetch(`${server.url}/api/agents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "HistoryBot" }),
    });
    expect(agentRes.ok).toBe(true);
    const agent = (await agentRes.json()) as { slug: string };

    const created = await fetch(`${server.url}/api/workflows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "history-routine",
        agent: agent.slug,
        task: "reply ok",
      }),
    });
    expect(created.ok).toBe(true);
    const wf = (await created.json()) as { slug: string };

    const runRes = await fetch(`${server.url}/api/workflows/${wf.slug}/run`, {
      method: "POST",
    });
    expect(runRes.ok).toBe(true);

    const runsRes = await fetch(`${server.url}/api/workflows/${wf.slug}/runs`);
    expect(runsRes.ok).toBe(true);
    const runs = (await runsRes.json()) as Array<{ status: string }>;
    expect(runs.length).toBeGreaterThan(0);

    const display = await fetch(
      `${server.url}/api/agents/${agent.slug}/computer/display`,
    );
    expect(display.ok).toBe(true);
    const body = (await display.json()) as {
      watching: boolean;
      frame: unknown;
    };
    expect(typeof body.watching).toBe("boolean");
  });
});
