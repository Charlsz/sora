import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSafeProcessEnv,
  createAgentComputer,
  FakeSandboxProvider,
  isForbiddenEnvKey,
  scrubSecretsFromText,
  SandboxComputer,
} from "../index.ts";

describe("security env", () => {
  test("forbids credential-like keys", () => {
    expect(isForbiddenEnvKey("OPENAI_API_KEY")).toBe(true);
    expect(isForbiddenEnvKey("E2B_API_KEY")).toBe(true);
    expect(isForbiddenEnvKey("MY_SECRET")).toBe(true);
    expect(isForbiddenEnvKey("PATH")).toBe(false);
    expect(isForbiddenEnvKey("HOME")).toBe(false);
  });

  test("safe env excludes injected secrets", () => {
    const env = buildSafeProcessEnv({
      OPENAI_API_KEY: "sk-test-should-not-appear",
      PATH: "/custom/bin",
      SORA_SAFE: "ok",
    });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.PATH).toBe("/custom/bin");
    // SORA_ prefix is forbidden
    expect(env.SORA_SAFE).toBeUndefined();
  });

  test("scrubs secrets from text", () => {
    const out = scrubSecretsFromText(
      "token=sk-abc123456789 and again sk-abc123456789",
      ["sk-abc123456789"],
    );
    expect(out).not.toContain("sk-abc123456789");
    expect(out).toContain("[REDACTED]");
  });
});

describe("sandbox computer fail-closed", () => {
  test("fake provider runs terminal in sandbox and syncs files", async () => {
    const root = mkdtempSync(join(tmpdir(), "sora-sbx-"));
    try {
      writeFileSync(join(root, "hello.txt"), "hi");
      const computer = new SandboxComputer({
        workspaceRoot: root,
        config: {
          version: 1,
          defaultModel: "mock:echo",
          sandbox: {
            enabled: true,
            provider: "fake",
            failClosed: true,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        secrets: {},
        sandboxProvider: new FakeSandboxProvider(),
      });
      const result = await computer.terminal.exec("ls");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("hello.txt");
      await computer.dispose();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("createAgentComputer stays local when sandbox off", () => {
    const root = mkdtempSync(join(tmpdir(), "sora-local-"));
    try {
      const computer = createAgentComputer({
        workspaceRoot: root,
        config: {
          version: 1,
          defaultModel: "mock:echo",
          sandbox: { enabled: false, provider: "local" },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      expect(computer.kind).toBe("local");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("e2b without key fails closed (no host shell)", async () => {
    const root = mkdtempSync(join(tmpdir(), "sora-e2b-"));
    try {
      const computer = new SandboxComputer({
        workspaceRoot: root,
        config: {
          version: 1,
          defaultModel: "mock:echo",
          sandbox: {
            enabled: true,
            provider: "e2b",
            failClosed: true,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        secrets: { providers: {} },
      });
      await expect(computer.terminal.exec("echo hi")).rejects.toThrow(
        /API key|fail|disabled|Host shell/i,
      );
      await computer.dispose();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("local terminal does not expose API keys", () => {
  test("echo of missing secret env fails closed in scrubbed shell", async () => {
    const root = mkdtempSync(join(tmpdir(), "sora-term-"));
    process.env.OPENAI_API_KEY = "sk-should-not-leak-in-shell-12345";
    try {
      const computer = createAgentComputer({
        workspaceRoot: root,
        config: {
          version: 1,
          defaultModel: "mock:echo",
          sandbox: { enabled: false, provider: "local" },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      const cmd =
        process.platform === "win32"
          ? "echo %OPENAI_API_KEY%"
          : "echo $OPENAI_API_KEY";
      const result = await computer.terminal.exec(cmd);
      expect(result.stdout).not.toContain("sk-should-not-leak-in-shell-12345");
    } finally {
      delete process.env.OPENAI_API_KEY;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
