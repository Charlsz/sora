import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
const DEFAULT_TIMEOUT_MS = 600_000;

type DesktopHandle = {
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
  stream: {
    start: (opts?: { requireAuth?: boolean; viewOnly?: boolean }) => Promise<void>;
    stop: () => Promise<void>;
    getUrl: (opts?: { authKey?: string; viewOnly?: boolean }) => string;
    getAuthKey: () => string;
  };
  screenshot: (format?: "bytes") => Promise<Uint8Array>;
  setTimeout: (ms: number) => Promise<unknown> | unknown;
  kill: () => Promise<unknown>;
  open: (fileOrUrl: string) => Promise<void>;
  write: (text: string, options?: { chunkSize?: number; delayInMs?: number }) => Promise<void>;
  press: (key: string | string[]) => Promise<void>;
  leftClick: (x?: number, y?: number) => Promise<void>;
};

/**
 * Full Linux GUI desktop via @e2b/desktop — live stream + screenshots for Watch / takeover.
 */
export class E2bDesktopSession implements SandboxSession {
  readonly info: SandboxSessionInfo;
  #handle: DesktopHandle;
  #secretValues: string[];
  #timeoutMs: number;
  #streamStarted = false;
  #streamUrl: string | null = null;

  constructor(
    handle: DesktopHandle,
    secretValues: string[] = [],
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.#handle = handle;
    this.#secretValues = secretValues;
    this.#timeoutMs = timeoutMs;
    this.info = {
      id: handle.sandboxId,
      provider: "e2b-desktop",
      remoteWorkspace: REMOTE_WORKSPACE,
      capabilities: { shell: true, files: true, desktop: true },
    };
  }

  async exec(
    command: string,
    options?: TerminalOptions,
  ): Promise<TerminalResult> {
    const envs = filterEnv(options?.env);
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
        if (
          name === "node_modules" ||
          name === ".git" ||
          name === ".sora-browser-profile"
        ) {
          continue;
        }
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) {
          await walk(full);
          continue;
        }
        if (
          /\.(png|jpg|jpeg|gif|webp|mp4|zip|exe|dll)$/i.test(name) &&
          st.size > 2_000_000
        ) {
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
      `find ${REMOTE_WORKSPACE} -type f -size -2M 2>/dev/null | head -n 500`,
      { timeoutMs: 60_000 },
    );
    const paths = (listed.stdout || "")
      .split("\n")
      .map((p) => p.trim())
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
        /* skip binary / missing */
      }
    }
    return { files };
  }

  async keepAlive(): Promise<void> {
    await this.#handle.setTimeout(this.#timeoutMs);
  }

  async ensureStream(): Promise<{ url: string }> {
    if (!this.#streamStarted) {
      await this.#handle.stream.start({ requireAuth: true });
      this.#streamStarted = true;
      const authKey = this.#handle.stream.getAuthKey();
      this.#streamUrl = this.#handle.stream.getUrl({ authKey });
    }
    if (!this.#streamUrl) {
      throw new Error("Desktop stream URL unavailable");
    }
    return { url: this.#streamUrl };
  }

  async screenshotDesktop(): Promise<Uint8Array> {
    return this.#handle.screenshot("bytes");
  }

  async desktopOpen(target: string): Promise<void> {
    await this.#handle.open(target);
  }

  async desktopWrite(text: string): Promise<void> {
    await this.#handle.write(text);
  }

  async desktopPress(key: string | string[]): Promise<void> {
    await this.#handle.press(key);
  }

  async desktopLeftClick(x?: number, y?: number): Promise<void> {
    await this.#handle.leftClick(x, y);
  }

  async getStreamUrl(): Promise<{ url: string } | null> {
    try {
      return await this.ensureStream();
    } catch {
      return null;
    }
  }

  async dispose(): Promise<void> {
    if (this.#streamStarted) {
      await this.#handle.stream.stop().catch(() => {});
    }
    await this.#handle.kill().catch(() => {});
  }
}

export class E2bDesktopProvider implements SandboxProvider {
  readonly id = "e2b-desktop";
  readonly capabilities = {
    shell: true,
    files: true,
    desktop: true,
  } as const;

  async create(options: SandboxCreateOptions): Promise<SandboxSession> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let Sandbox: {
      create: (opts?: Record<string, unknown>) => Promise<DesktopHandle>;
    };
    try {
      const mod = await import("@e2b/desktop");
      Sandbox = (mod as { Sandbox: typeof Sandbox }).Sandbox;
    } catch {
      throw new Error(
        "E2B Desktop SDK missing. Run: bun add @e2b/desktop — or use Secure cloud (lean shell) instead.",
      );
    }

    if (!options.apiKey) {
      throw new Error(
        "Cloud desktop needs an E2B key. Add it under Connections.",
      );
    }

    const handle = await Sandbox.create({
      apiKey: options.apiKey,
      timeoutMs,
      resolution: [1280, 720],
      metadata: {
        product: "sora",
        mode: "desktop",
        ...(options.metadata ?? {}),
      },
      envs: {},
    });

    await handle.commands.run(`mkdir -p ${REMOTE_WORKSPACE}`, {
      timeoutMs: 30_000,
    });

    return new E2bDesktopSession(handle, [options.apiKey], timeoutMs);
  }
}

function filterEnv(env?: Record<string, string>): Record<string, string> {
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
