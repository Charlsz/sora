import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventBus, SoraRuntime, getPaths } from "../src/index.ts";

describe("paths", () => {
  test("defaults to ~/.sora and respects SORA_HOME", () => {
    const prev = process.env.SORA_HOME;
    delete process.env.SORA_HOME;
    expect(getPaths().home.endsWith(".sora") || getPaths().home.includes(".sora")).toBe(true);

    process.env.SORA_HOME = join(tmpdir(), "sora-test-home");
    expect(getPaths().home).toBe(process.env.SORA_HOME);
    expect(getPaths().agent("dev").workspace).toContain("agents");

    if (prev === undefined) delete process.env.SORA_HOME;
    else process.env.SORA_HOME = prev;
  });
});

describe("EventBus", () => {
  test("delivers typed and wildcard events", async () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on("agent.created", (e) => {
      seen.push(e.type);
    });
    bus.on("*", (e) => {
      seen.push(`*:${e.type}`);
    });
    await bus.emit("agent.created", { slug: "dev" });
    expect(seen).toEqual(["agent.created", "*:agent.created"]);
  });
});

describe("SoraRuntime", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "sora-runtime-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test("init creates config and database", () => {
    const runtime = new SoraRuntime({ home });
    const config = runtime.init();
    expect(config.defaultModel).toBe("openrouter:openai/gpt-4o-mini");
    expect(runtime.isInitialized).toBe(true);
    expect(runtime.db.query("SELECT count(*) as c FROM meta").get()).toEqual({
      c: 1,
    });
    runtime.close();
  });

  test("ensureInitialized fails before init", () => {
    const runtime = new SoraRuntime({ home });
    expect(() => runtime.ensureInitialized()).toThrow(/not initialized/);
  });
});
