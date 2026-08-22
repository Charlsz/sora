import type { Terminal, TerminalOptions, TerminalResult } from "./types.ts";
import { LocalFilesystem } from "./filesystem.ts";
import { shellCommand } from "./shell.ts";

export class LocalTerminal implements Terminal {
  constructor(private readonly fs: LocalFilesystem) {}

  async exec(command: string, options: TerminalOptions = {}): Promise<TerminalResult> {
    const cwd = options.cwd
      ? this.fs.resolveSafe(options.cwd)
      : this.fs.workspaceRoot;

    const timeoutMs = options.timeoutMs ?? 30_000;
    const proc = Bun.spawn(shellCommand(command), {
      cwd,
      env: {
        ...process.env,
        ...options.env,
      },
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
