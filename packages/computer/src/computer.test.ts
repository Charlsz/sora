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
});
