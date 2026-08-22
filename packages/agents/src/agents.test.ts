import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgent,
  createSoraServices,
  initSora,
} from "../src/index.ts";

describe("agents", () => {
  let home: string;
  let services: ReturnType<typeof createSoraServices>;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "sora-agents-"));
    const { runtime } = initSora({ home });
    runtime.close();
    services = createSoraServices({ home });
  });

  afterEach(async () => {
    services.runtime.close();
    // Windows may briefly keep SQLite handles; retry delete.
    for (let i = 0; i < 5; i++) {
      try {
        rmSync(home, { recursive: true, force: true });
        return;
      } catch {
        await Bun.sleep(50);
      }
    }
    rmSync(home, { recursive: true, force: true });
  });

  test("create and list agents", async () => {
    const klaus = await createAgent(services, {
      name: "Klaus",
      description: "Executive assistant",
    });
    expect(klaus.slug).toBe("klaus");
    expect(klaus.model).toBe("mock:echo");

    const listed = services.agents.list();
    expect(listed.map((a) => a.slug)).toContain("klaus");
  });

  test("run agent with mock model", async () => {
    await createAgent(services, { name: "Dev", description: "Engineer" });
    const result = await services.runner.run({
      agent: "dev",
      prompt: "hello",
    });
    expect(result.reply.toLowerCase()).toContain("hello");
    expect(result.conversationId).toStartWith("conv_");
  });

  test("persists conversation messages", async () => {
    await createAgent(services, { name: "Ops" });
    const result = await services.runner.run({
      agent: "ops",
      prompt: "status check",
    });
    const messages = await services.conversations.listMessages(
      result.conversationId,
    );
    expect(messages.some((m) => m.role === "user")).toBe(true);
    expect(messages.some((m) => m.role === "assistant")).toBe(true);
  });
});