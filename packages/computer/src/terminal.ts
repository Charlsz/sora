import type { Terminal, TerminalOptions, TerminalResult } from "./types.ts";
import { LocalFilesystem } from "./filesystem.ts";
import { buildSafeProcessEnv } from "./security/env.ts";
import { shellCommand } from "./shell.ts";

/**
 * Best-effort workspace terminal.
 * Sets cwd inside the workspace and rejects obvious escape patterns.
 * Does NOT inherit host process.env (API keys stay out of the shell).
 * This is not a full OS sandbox — PermissionGate remains mandatory.
 * For stronger isolation, enable cloud sandbox (E2B) in Settings.
 */
export class LocalTerminal implements Terminal {
  constructor(private readonly fs: LocalFilesystem) {}

  async exec(command: string, options: TerminalOptions = {}): Promise<TerminalResult> {
    const cwd = options.cwd
      ? this.fs.resolveSafe(options.cwd)
      : this.fs.workspaceRoot;

    assertCommandWorkspaceSafe(command, this.fs.workspaceRoot);

    const timeoutMs = options.timeoutMs ?? 30_000;
    const proc = Bun.spawn(shellCommand(command), {
      cwd,
      env: buildSafeProcessEnv(options.env),
      stdout: "pipe",
      stderr: "pipe",
    });

    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        // ignore
      }
    }, timeoutMs);

    try {
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      return {
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        exitCode,
        cwd,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Reject path traversal and absolute path targets in shell commands. */
export function assertCommandWorkspaceSafe(
  command: string,
  workspaceRoot: string,
): void {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error("Empty command");
  }

  // Match `..` as a path segment, including `cd ..`
  if (/(^|[\s"'`=])\.\.($|[\s"'`/\\])/.test(trimmed)) {
    throw new Error("Terminal command rejected: path traversal (..)");
  }

  // Windows drive-letter absolute paths
  if (/(^|[\s"'`])[A-Za-z]:[\\/]/.test(trimmed)) {
    const normalizedRoot = workspaceRoot.replace(/\\/g, "/").toLowerCase();
    const normalizedCmd = trimmed.replace(/\\/g, "/").toLowerCase();
    if (!normalizedCmd.includes(normalizedRoot)) {
      throw new Error(
        "Terminal command rejected: absolute paths outside the workspace are not allowed",
      );
    }
  }

  // Unix absolute paths — ignore short flags like `/b`, `/s` common on Windows.
  if (
    /(^|[\s"'`])\/(?![a-zA-Z0-9]{1,2}(?=[\s"'`]|$))(?!dev\/null\b)/.test(trimmed)
  ) {
    const normalizedRoot = workspaceRoot.replace(/\\/g, "/").toLowerCase();
    const normalizedCmd = trimmed.replace(/\\/g, "/").toLowerCase();
    if (!normalizedCmd.includes(normalizedRoot)) {
      throw new Error(
        "Terminal command rejected: absolute paths outside the workspace are not allowed",
      );
    }
  }
}
