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

const REMOTE_WORKSPACE = "/workspace";
const IMAGE = process.env.SORA_DOCKER_IMAGE?.trim() || "alpine:3.20";

/**
 * Docker Computer: durable Linux shell with the agent workspace bind-mounted.
 * No API key. Requires Docker Desktop / daemon on the host.
 * Browser stays on the host (local Playwright).
 */
export class DockerSandboxSession implements SandboxSession {
  readonly info: SandboxSessionInfo;
  readonly #containerId: string;
  readonly #localRoot: string;

  constructor(containerId: string, localRoot: string) {
    this.#containerId = containerId;
    this.#localRoot = localRoot;
    this.info = {
      id: containerId.slice(0, 12),
      provider: "docker",
      remoteWorkspace: REMOTE_WORKSPACE,
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
    const args = ["exec", "-w", cwd];
    if (options?.env) {
      for (const [k, v] of Object.entries(options.env)) {
        args.push("-e", `${k}=${v}`);
      }
    }
    args.push(this.#containerId, "sh", "-c", command);

    const proc = Bun.spawn(["docker", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: {}, // never inherit host secrets into docker CLI env for the agent cmd
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return {
      stdout,
      stderr,
      exitCode,
      cwd,
    };
  }

  async writeFile(remotePath: string, content: string | Uint8Array): Promise<void> {
    const rel = remotePath.startsWith(REMOTE_WORKSPACE)
      ? remotePath.slice(REMOTE_WORKSPACE.length).replace(/^\//, "")
      : remotePath.replace(/^\//, "");
    const dest = join(this.#localRoot, ...rel.split("/").filter(Boolean));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(
      dest,
      typeof content === "string" ? content : Buffer.from(content),
    );
  }

  async readFile(remotePath: string): Promise<string> {
    const rel = remotePath.startsWith(REMOTE_WORKSPACE)
      ? remotePath.slice(REMOTE_WORKSPACE.length).replace(/^\//, "")
      : remotePath.replace(/^\//, "");
    const dest = join(this.#localRoot, ...rel.split("/").filter(Boolean));
    return readFileSync(dest, "utf8");
  }

  /** Bind mount already shares files — no upload needed. */
  async syncFromLocal(_localRoot: string): Promise<{ files: number }> {
    return { files: 0 };
  }

  async syncToLocal(_localRoot: string): Promise<{ files: number }> {
    return { files: 0 };
  }

  async keepAlive(): Promise<void> {}

  async dispose(): Promise<void> {
    const proc = Bun.spawn(["docker", "rm", "-f", this.#containerId], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
  }
}

export class DockerSandboxProvider implements SandboxProvider {
  readonly id = "docker";
  readonly capabilities = {
    shell: true,
    files: true,
    desktop: false,
  } as const;

  /**
   * `apiKey` unused. `metadata.localRoot` must be the host workspace path
   * (injected by SandboxComputer).
   */
  async create(options: SandboxCreateOptions): Promise<SandboxSession> {
    const localRoot = options.metadata?.localRoot?.trim();
    if (!localRoot) {
      throw new Error(
        "Docker Computer needs metadata.localRoot (agent workspace path).",
      );
    }

    const name = `sora-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const mount = `${normalizeDockerPath(localRoot)}:${REMOTE_WORKSPACE}`;
    const proc = Bun.spawn(
      [
        "docker",
        "run",
        "-d",
        "--name",
        name,
        "--rm",
        "-v",
        mount,
        "-w",
        REMOTE_WORKSPACE,
        IMAGE,
        "sleep",
        "infinity",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code !== 0) {
      throw new Error(
        `Docker Computer failed to start (is Docker running?): ${stderr.trim() || stdout.trim() || `exit ${code}`}`,
      );
    }
    const containerId = stdout.trim();
    if (!containerId) {
      throw new Error("Docker Computer started but returned no container id");
    }
    return new DockerSandboxSession(containerId, localRoot);
  }
}

/** Docker Desktop on Windows prefers forward-slash absolute paths. */
function normalizeDockerPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  // C:/Users/... → /c/Users/... helps some Docker Desktop setups
  const win = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  if (win) {
    return `/${win[1]!.toLowerCase()}/${win[2]}`;
  }
  return normalized;
}

/** Walk used only by tests / diagnostics. */
export function listLocalFiles(localRoot: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".git") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(localRoot, full).split(sep).join("/"));
    }
  };
  walk(localRoot);
  return out;
}
