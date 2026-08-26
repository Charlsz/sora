import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import type { TerminalOptions, TerminalResult } from "../types.ts";
import { isForbiddenEnvKey } from "../security/env.ts";
import type {
  SandboxCreateOptions,
  SandboxProvider,
  SandboxSession,
  SandboxSessionInfo,
} from "./types.ts";

/**
 * In-memory sandbox for tests — same contract as E2B, no network.
 * Commands are a tiny interpreter (echo / write via files only).
 */
export class FakeSandboxSession implements SandboxSession {
  readonly info: SandboxSessionInfo;
  #files = new Map<string, string>();

  constructor(id = `fake_${crypto.randomUUID().slice(0, 8)}`) {
    this.info = {
      id,
      provider: "fake",
      remoteWorkspace: "/home/user/workspace",
      capabilities: { shell: true, files: true, desktop: false },
    };
  }

  async exec(
    command: string,
    options?: TerminalOptions,
  ): Promise<TerminalResult> {
    if (options?.env) {
      for (const key of Object.keys(options.env)) {
        if (isForbiddenEnvKey(key)) {
          return {
            stdout: "",
            stderr: `Refused: env key "${key}" is not allowed in sandbox`,
            exitCode: 1,
            cwd: this.info.remoteWorkspace,
          };
        }
      }
    }
    const cwd = options?.cwd ?? this.info.remoteWorkspace;
    const trimmed = command.trim();
    if (trimmed.startsWith("echo ")) {
      return {
        stdout: trimmed.slice(5).replace(/^["']|["']$/g, ""),
        stderr: "",
        exitCode: 0,
        cwd,
      };
    }
    if (trimmed === "pwd") {
      return { stdout: cwd, stderr: "", exitCode: 0, cwd };
    }
    if (trimmed === "ls" || trimmed.startsWith("ls ")) {
      const prefix = cwd.endsWith("/") ? cwd : `${cwd}/`;
      const names = [...this.#files.keys()]
        .filter((p) => p.startsWith(prefix))
        .map((p) => p.slice(prefix.length).split("/")[0])
        .filter(Boolean);
      return {
        stdout: [...new Set(names)].join("\n"),
        stderr: "",
        exitCode: 0,
        cwd,
      };
    }
    return {
      stdout: "",
      stderr: `fake sandbox: unsupported command "${trimmed.slice(0, 80)}"`,
      exitCode: 127,
      cwd,
    };
  }

  async writeFile(remotePath: string, content: string | Uint8Array): Promise<void> {
    const text =
      typeof content === "string" ? content : new TextDecoder().decode(content);
    this.#files.set(normalizeRemote(remotePath), text);
  }

  async readFile(remotePath: string): Promise<string> {
    const key = normalizeRemote(remotePath);
    const value = this.#files.get(key);
    if (value === undefined) throw new Error(`File not found: ${remotePath}`);
    return value;
  }

  async syncFromLocal(localRoot: string): Promise<{ files: number }> {
    let files = 0;
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".git") continue;
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) {
          walk(full);
          continue;
        }
        const rel = relative(localRoot, full).split(sep).join("/");
        const remote = `${this.info.remoteWorkspace}/${rel}`;
        this.#files.set(normalizeRemote(remote), readFileSync(full, "utf8"));
        files += 1;
      }
    };
    walk(localRoot);
    return { files };
  }

  async syncToLocal(localRoot: string): Promise<{ files: number }> {
    let files = 0;
    const prefix = `${this.info.remoteWorkspace}/`;
    for (const [remote, content] of this.#files) {
      if (!remote.startsWith(prefix) && remote !== this.info.remoteWorkspace) {
        continue;
      }
      const rel =
        remote === this.info.remoteWorkspace
          ? ""
          : remote.slice(prefix.length);
      if (!rel || rel.endsWith("/")) continue;
      const dest = join(localRoot, ...rel.split("/"));
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content, "utf8");
      files += 1;
    }
    return { files };
  }

  async keepAlive(): Promise<void> {}

  async dispose(): Promise<void> {
    this.#files.clear();
  }
}

export class FakeSandboxProvider implements SandboxProvider {
  readonly id = "fake";
  readonly capabilities = {
    shell: true,
    files: true,
    desktop: false,
  } as const;

  async create(_options: SandboxCreateOptions): Promise<SandboxSession> {
    return new FakeSandboxSession();
  }
}

function normalizeRemote(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}
