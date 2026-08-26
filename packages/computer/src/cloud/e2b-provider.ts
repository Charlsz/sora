import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import {
  isForbiddenEnvKey,
  scrubSecretsFromText,
} from "../security/env.ts";
import type { TerminalOptions, TerminalResult } from "../types.ts";
import type {
  SandboxCreateOptions,
  SandboxProvider,
  SandboxSession,
  SandboxSessionInfo,
} from "./types.ts";

const REMOTE_WORKSPACE = "/home/user/workspace";
const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes — cheaper than always-on desktops

type E2bSandboxHandle = {
  sandboxId: string;
  commands: {
    run: (
      cmd: string,
      opts?: { cwd?: string; envs?: Record<string, string>; timeoutMs?: number },
    ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  };
  files: {
    write: (path: string, data: string | Uint8Array) => Promise<unknown>;
    read: (path: string, opts?: { format?: string }) => Promise<string | Uint8Array>;
  };
  setTimeout: (ms: number) => Promise<unknown> | unknown;
  kill: () => Promise<unknown>;
};

/**
 * E2B code sandbox (Firecracker microVM) — not E2B Desktop.
 * Cheaper and smaller than Rakazo's full GUI computer; browser stays on the host.
 */
export class E2bSandboxSession implements SandboxSession {
  readonly info: SandboxSessionInfo;
  #handle: E2bSandboxHandle;
  #secretValues: string[];
  #timeoutMs: number;

  constructor(
    handle: E2bSandboxHandle,
    secretValues: string[] = [],
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.#handle = handle;
    this.#secretValues = secretValues;
    this.#timeoutMs = timeoutMs;
    this.info = {
      id: handle.sandboxId,
      provider: "e2b",
      remoteWorkspace: REMOTE_WORKSPACE,
      capabilities: { shell: true, files: true, desktop: false },
    };
  }

  async exec(
    command: string,
    options?: TerminalOptions,
  ): Promise<TerminalResult> {
    const envs = filterSandboxEnv(options?.env);
    const cwd = options?.cwd ?? this.info.remoteWorkspace;
    const result = await this.#handle.commands.run(command, {
      cwd,
      envs,
      timeoutMs: options?.timeoutMs ?? 120_000,
    });
    return {
      stdout: scrubSecretsFromText(result.stdout ?? "", this.#secretValues),
      stderr: scrubSecretsFromText(result.stderr ?? "", this.#secretValues),
      exitCode: result.exitCode ?? 0,
      cwd,
    };
  }

  async writeFile(remotePath: string, content: string | Uint8Array): Promise<void> {
    await this.#handle.files.write(remotePath, content);
  }

  async readFile(remotePath: string): Promise<string> {
    const data = await this.#handle.files.read(remotePath, { format: "text" });
    return typeof data === "string" ? data : new TextDecoder().decode(data);
  }

  async syncFromLocal(localRoot: string): Promise<{ files: number }> {
    await this.#handle.commands.run(`mkdir -p ${REMOTE_WORKSPACE}`, {
      timeoutMs: 30_000,
    });
    let files = 0;
    const walk = async (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".git" || name === ".sora-browser-profile") {
          continue;
        }
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) {
          await walk(full);
          continue;
        }
        // Skip large binaries by extension for cost/perf
        if (/\.(png|jpg|jpeg|gif|webp|mp4|zip|exe|dll)$/i.test(name) && st.size > 2_000_000) {
          continue;
        }
        const rel = relative(localRoot, full).split(sep).join("/");
        const remote = `${REMOTE_WORKSPACE}/${rel}`;
        const parent = remote.slice(0, remote.lastIndexOf("/"));
        await this.#handle.commands.run(`mkdir -p ${shellQuote(parent)}`, {
          timeoutMs: 15_000,
        });
        await this.#handle.files.write(remote, readFileSync(full));
        files += 1;
      }
    };
    await walk(localRoot);
    return { files };
  }

  async syncToLocal(localRoot: string): Promise<{ files: number }> {
    const listed = await this.#handle.commands.run(
      `find ${REMOTE_WORKSPACE} -type f 2>/dev/null | head -n 5000`,
      { timeoutMs: 60_000 },
    );
    const paths = (listed.stdout || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    let files = 0;
    for (const remote of paths) {
      if (!remote.startsWith(REMOTE_WORKSPACE)) continue;
      const rel = remote.slice(REMOTE_WORKSPACE.length).replace(/^\//, "");
      if (!rel) continue;
      try {
        const content = await this.readFile(remote);
        const dest = join(localRoot, ...rel.split("/"));
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, content, "utf8");
        files += 1;
      } catch {
        // skip unreadable
      }
    }
    return { files };
  }

  async keepAlive(): Promise<void> {
    await this.#handle.setTimeout(this.#timeoutMs);
  }

  async dispose(): Promise<void> {
    await this.#handle.kill().catch(() => {});
  }
}

export class E2bSandboxProvider implements SandboxProvider {
  readonly id = "e2b";
  readonly capabilities = {
    shell: true,
    files: true,
    desktop: false,
  } as const;

  async create(options: SandboxCreateOptions): Promise<SandboxSession> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let Sandbox: {
      create: (opts: Record<string, unknown>) => Promise<E2bSandboxHandle>;
    };
    try {
      const mod = await import("e2b");
      Sandbox = (mod as { Sandbox: typeof Sandbox }).Sandbox;
    } catch {
      throw new Error(
        "E2B SDK not installed. Run: bun add e2b  (or disable sandbox in Settings)",
      );
    }

    // Never pass host process.env — empty envs; secrets stay on host.
    const handle = await Sandbox.create({
      apiKey: options.apiKey,
      timeoutMs,
      metadata: {
        product: "sora",
        ...(options.metadata ?? {}),
      },
      envs: {},
    });

    await handle.commands.run(`mkdir -p ${REMOTE_WORKSPACE}`, {
      timeoutMs: 30_000,
    });

    return new E2bSandboxSession(handle, [options.apiKey], timeoutMs);
  }
}

export function resolveE2bApiKey(
  secrets?: { providers?: Record<string, { apiKey?: string }> },
): string | null {
  return (
    secrets?.providers?.e2b?.apiKey?.trim() ||
    process.env.E2B_API_KEY?.trim() ||
    null
  );
}

function filterSandboxEnv(
  env?: Record<string, string>,
): Record<string, string> {
  // Never merge host process.env into the microVM.
  const out: Record<string, string> = {};
  if (!env) return out;
  for (const [key, value] of Object.entries(env)) {
    if (isForbiddenEnvKey(key)) continue;
    out[key] = value;
  }
  return out;
}

function shellQuote(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}
