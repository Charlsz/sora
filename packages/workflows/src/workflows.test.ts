import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventBus, SoraRuntime } from "@sora/core";
import {
  WorkflowEngine,
  WorkflowStore,
} from "../src/index.ts";

describe("WorkflowStore + WorkflowEngine", () => {
  let home: string;
  let runtime: SoraRuntime;
  let store: WorkflowStore;
  let engine: WorkflowEngine;
  let executed: Array<{ agent: string; prompt: string; skill?: string }>;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "sora-wf-"));
    runtime = new SoraRuntime({ home });
    runtime.init();
    store = new WorkflowStore(runtime.db);
    executed = [];
    engine = new WorkflowEngine({
      store,
      events: runtime.events,
      executor: {
        async run(input) {
          executed.push(input);
          if (input.prompt.includes("FAIL")) {
            throw new Error("boom");
          }
          return {
            reply: `done:${input.agent}:${input.skill ?? "none"}`,
            conversationId: "conv_test",
            toolCalls: [],
          };
        },
      },
    });
  });

  afterEach(async () => {
    engine.stopScheduler();
    runtime.close();
    for (let i = 0; i < 5; i++) {
      try {
        rmSync(home, { recursive: true, force: true });
        return;
      } catch {
        await Bun.sleep(30);
      }
    }
  });

  test("creates and lists workflows", () => {
    const wf = store.create({
      name: "Morning Brief",
      agent: "klaus",
      task: "Prepare my morning briefing",
      trigger: { type: "cron", expression: "0 7 * * 1-5" },
    });
    expect(wf.slug).toBe("morning-brief");
    expect(store.list()).toHaveLength(1);
  });

  test("manual run goes through executor", async () => {
    store.create({
      name: "Adhoc",
      agent: "dev",
      skill: "github-review",
      task: "Review the workspace",
      trigger: { type: "manual" },
    });

    const events: string[] = [];
    runtime.events.on("*", (e) => events.push(e.type));

    const run = await engine.run("adhoc");
    expect(run.status).toBe("completed");
    expect(run.reply).toContain("done:dev:github-review");
    expect(executed[0]?.skill).toBe("github-review");
    expect(events).toContain("workflow.triggered");
    expect(events).toContain("workflow.started");
    expect(events).toContain("workflow.step.started");
    expect(events).toContain("workflow.step.completed");
    expect(events).toContain("workflow.completed");
  });

  test("failed execution emits workflow.failed", async () => {
    store.create({
      name: "Broken",
      agent: "klaus",
      task: "FAIL please",
      trigger: { type: "manual" },
    });
    const run = await engine.run("broken");
    expect(run.status).toBe("failed");
    expect(run.error).toContain("boom");
  });

  test("webhook trigger matches path and secret", async () => {
    store.create({
      name: "Hook",
      agent: "dev",
      task: "Handle webhook",
      trigger: { type: "webhook", path: "github/pr", secret: "s3cret" },
    });

    const denied = await engine.handleWebhook({
      path: "github/pr",
      secret: "wrong",
    });
    expect(denied).toHaveLength(0);

    const ok = await engine.handleWebhook({
      path: "github/pr",
      secret: "s3cret",
      body: { pr: 12 },
    });
    expect(ok).toHaveLength(1);
    expect(ok[0]!.status).toBe("completed");
    expect(executed[0]?.prompt).toContain('"pr": 12');
  });

  test("cron tick fires matching expression", async () => {
    store.create({
      name: "Daily",
      agent: "klaus",
      task: "Tick task",
      trigger: { type: "cron", expression: "0 7 * * *" },
    });

    const monday7 = new Date(2026, 7, 24, 7, 0, 0);
    const runs = await engine.tick(monday7);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.triggerType).toBe("cron");

    // Same minute should not double-fire
    const again = await engine.tick(monday7);
    expect(again).toHaveLength(0);
  });

  test("disabled workflow does not run via webhook", async () => {
    store.create({
      name: "Off",
      agent: "dev",
      task: "Nope",
      trigger: { type: "webhook", path: "x" },
      enabled: false,
    });
    const runs = await engine.handleWebhook({ path: "x" });
    expect(runs).toHaveLength(0);
  });
});
