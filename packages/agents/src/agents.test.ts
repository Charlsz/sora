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
    services.runtime.close();
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

  test("writes files through LocalComputer tools", async () => {
    await createAgent(services, { name: "Dev" });
    const result = await services.runner.run({
      agent: "dev",
      prompt: "write file hello.ts containing console.log('hi')",
    });
    expect(result.toolCalls.some((t) => t.name === "write_file" && t.ok)).toBe(
      true,
    );
    const workspace = services.runtime.paths.agent("dev").workspace;
    const content = await Bun.file(join(workspace, "hello.ts")).text();
    expect(content).toContain("console.log");
  });

  test("agent_message queues and delivers on next run", async () => {
    await createAgent(services, { name: "Klaus" });
    await createAgent(services, { name: "Dev" });

    const sendResult = await services.runner.executeToolForWorkflow(
      "klaus",
      "agent_message",
      {
        to: "dev",
        message: "Please check the build",
        deliver: "queue",
      },
    );
    expect(sendResult.ok).toBe(true);

    const unread = services.inbox.listUnread(
      services.agents.requireBySlugOrName("dev").id,
    );
    expect(unread.some((m) => m.content.includes("check the build"))).toBe(
      true,
    );

    const run = await services.runner.run({
      agent: "dev",
      prompt: "status",
    });
    expect(run.reply.length).toBeGreaterThan(0);
    const after = services.inbox.listUnread(
      services.agents.requireBySlugOrName("dev").id,
    );
    expect(after.length).toBe(0);
  });

  test("Klaus delegates to Dev", async () => {
    await createAgent(services, {
      name: "Klaus",
      description: "Executive assistant",
    });
    await createAgent(services, {
      name: "Dev",
      description: "Builds TypeScript and Bun applications",
    });

    const result = await services.runner.run({
      agent: "klaus",
      prompt: "Ask Dev to create a hello world Bun server",
    });

    expect(result.toolCalls.some((t) => t.name === "delegate_task" && t.ok)).toBe(
      true,
    );
    const server = await Bun.file(
      join(services.runtime.paths.agent("dev").workspace, "server.ts"),
    ).text();
    expect(server).toContain("Bun.serve");
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

  test("shared skill execution with permissions and LocalComputer", async () => {
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
      name: "Klaus",
      description: "Executive assistant",
    });
    await createAgent(services, {
      name: "Dev",
      description: "Builds TypeScript and Bun applications",
    });

    await Bun.write(
      join(services.runtime.paths.agent("dev").workspace, "app.ts"),
      "export const ok = true;\n",
    );

    const klausRun = await services.runner.run({
      agent: "klaus",
      prompt: "/github-review",
    });
    expect(klausRun.skillId).toBe("github-review");
    expect(klausRun.toolCalls.some((t) => t.name === "list_dir" && t.ok)).toBe(
      true,
    );
    expect(klausRun.toolCalls.some((t) => t.name === "write_file" && t.ok)).toBe(
      true,
    );
    const klausReview = await Bun.file(
      join(services.runtime.paths.agent("klaus").workspace, "REVIEW.md"),
    ).text();
    expect(klausReview).toContain("Workspace Review");

    const devRun = await services.runner.run({
      agent: "dev",
      prompt: "review the workspace",
      skill: "github-review",
    });
    expect(devRun.skillId).toBe("github-review");
    const devReview = await Bun.file(
      join(services.runtime.paths.agent("dev").workspace, "REVIEW.md"),
    ).text();
    expect(devReview).toContain("app.ts");
  });

  test("skill fails when required tools are missing", async () => {
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
      name: "Limited",
      tools: ["echo"],
    });
    await expect(
      services.runner.run({
        agent: "limited",
        prompt: "/github-review",
      }),
    ).rejects.toThrow(/not available|requires tools/i);
  });

  test("skill respects permission deny", async () => {
    services.runtime.close();
    services = createSoraServices({
      home,
      permissions: {
        autoApprove: false,
        policy: {
          default: "deny",
          actions: {
            "fs.read": "allow",
            "fs.write": "deny",
            "fs.delete": "deny",
            "terminal.exec": "deny",
            "http.request": "deny",
            "browser.navigate": "deny",
            "agent.message": "allow",
            "agent.delegate": "deny",
          },
        },
      },
    });
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
    await createAgent(services, { name: "Dev" });

    const result = await services.runner.run({
      agent: "dev",
      prompt: "/github-review",
    });
    expect(
      result.toolCalls.some((t) => t.name === "write_file" && !t.ok),
    ).toBe(true);
  });
});
