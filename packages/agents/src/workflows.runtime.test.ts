import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgent,
  createSoraServices,
  initSora,
} from "../src/index.ts";

describe("workflows via runtime", () => {
  let home: string;
  let services: ReturnType<typeof createSoraServices>;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "sora-wf-rt-"));
    const { runtime } = initSora({ home });
    runtime.close();
    services = createSoraServices({
      home,
      permissions: { autoApprove: true },
    });
    services.runtime.updateConfig({
      defaultModel: "mock:echo",
      computer: { provider: "local", failClosed: true },
    });
  });

  afterEach(async () => {
    services.workflowEngine.stopScheduler();
    services.runtime.close();
    for (let i = 0; i < 5; i++) {
      try {
        rmSync(home, { recursive: true, force: true });
        return;
      } catch {
        await Bun.sleep(40);
      }
    }
  });

  test("workflow run executes agent through PermissionGate path", async () => {
    await createAgent(services, {
      name: "Klaus",
      description: "Executive assistant",
    });

    services.workflows.create({
      name: "Morning Brief",
      agent: "klaus",
      task: "hello",
      trigger: { type: "manual" },
    });

    const run = await services.workflowEngine.run("morning-brief");
    expect(run.status).toBe("completed");
    expect(run.reply?.toLowerCase()).toContain("hello");
    expect(run.conversationId).toBeTruthy();
  });

  test("workflow with skill uses shared skill", async () => {
    const example = join(
      import.meta.dir,
      "..",
      "..",
      "..",
      "examples",
      "skills",
      "github-review",
    );
    services.skills.install(example);
    await createAgent(services, {
      name: "Dev",
      description: "Builds TypeScript and Bun applications",
    });

    services.workflows.create({
      name: "Review On Demand",
      agent: "dev",
      skill: "github-review",
      task: "Review the workspace",
      trigger: { type: "webhook", path: "review" },
    });

    const runs = await services.workflowEngine.handleWebhook({ path: "review" });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("completed");
    const review = await Bun.file(
      join(services.runtime.paths.agent("dev").workspace, "REVIEW.md"),
    ).text();
    expect(review).toContain("Workspace Review");
  });
});
