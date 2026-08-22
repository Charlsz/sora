import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalComputer, LocalFilesystem } from "../src/index.ts";

describe("LocalFilesystem", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "sora-fs-"));
  });

  afterEach(async () => {
    for (let i = 0; i < 5; i++) {
      try {
        rmSync(root, { recursive: true, force: true });
        return;
      } catch {
        await Bun.sleep(20);
      }
    }
  });

  test("reads and writes within workspace", async () => {
    const fs = new LocalFilesystem(root);
    await fs.writeFile("notes/hi.txt", "hello");
    expect(await fs.readFile("notes/hi.txt")).toBe("hello");
    expect(await fs.listDir("notes")).toEqual(["hi.txt"]);
  });

  test("blocks path traversal", () => {
    const fs = new LocalFilesystem(root);
    expect(() => fs.resolveSafe("../outside.txt")).toThrow(/escapes workspace/);
  });
});

describe("LocalComputer", () => {
  test("runs a command in workspace", async () => {
    const root = mkdtempSync(join(tmpdir(), "sora-pc-"));
    try {
      const computer = new LocalComputer({ workspaceRoot: root });
      await computer.filesystem.writeFile("a.txt", "x");
      const result = await computer.terminal.exec(
        process.platform === "win32" ? "dir /b" : "ls",
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("a.txt");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects traversal in terminal commands", async () => {
    const root = mkdtempSync(join(tmpdir(), "sora-pc-"));
    try {
      const computer = new LocalComputer({ workspaceRoot: root });
      await expect(computer.terminal.exec("cd .. && dir")).rejects.toThrow(
        /traversal|absolute/i,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("PlaceholderBrowser", () => {
  test("reports offline navigate", async () => {
    process.env.SORA_BROWSER = "off";
    const { createBrowser } = await import("../src/browser.ts");
    const browser = createBrowser({
      profileDir: join(tmpdir(), "sora-br-profile"),
      workspaceRoot: mkdtempSync(join(tmpdir(), "sora-br-ws-")),
    });
    expect(browser.status().backend).toBe("placeholder");
    const result = await browser.navigate("https://example.com");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/placeholder|offline/i);
  });
});
