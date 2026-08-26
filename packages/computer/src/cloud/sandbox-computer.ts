import type { SoraConfig } from "@sora/core";
import { LocalComputer, type LocalComputerOptions } from "../local.ts";
import {
  collectSecretValues,
  scrubSecretsFromText,
} from "../security/env.ts";
import type { Computer, Terminal, TerminalOptions, TerminalResult } from "../types.ts";
import { E2bSandboxProvider, resolveE2bApiKey } from "./e2b-provider.ts";
import { FakeSandboxProvider } from "./fake-provider.ts";
import type { SandboxProvider, SandboxSession } from "./types.ts";

export type SandboxComputerOptions = LocalComputerOptions & {
  config: SoraConfig;
  secrets?: { providers?: Record<string, { apiKey?: string }> };
  /** Test hook — inject a provider (e.g. FakeSandboxProvider). */
  sandboxProvider?: SandboxProvider;
};

/**
 * Local-first computer with optional isolated cloud shell+files.
 *
 * Security (stricter than silent hybrid fallbacks):
 * - When sandbox is enabled, terminal NEVER falls back to the host shell.
 * - Provider API keys stay on the host; sandbox env is allowlisted/empty.
 * - Workspace is synced into the VM; browser stays local (cost/perf vs full desktop).
 */
export class SandboxComputer implements Computer {
  readonly #local: LocalComputer;
  readonly #options: SandboxComputerOptions;
  readonly #provider: SandboxProvider;
  readonly #failClosed: boolean;
  readonly #idleMs: number;
  #session: SandboxSession | null = null;
  #sessionPromise: Promise<SandboxSession> | null = null;
  readonly kind = "cloud" as const;

  constructor(options: SandboxComputerOptions) {
    this.#local = new LocalComputer(options);
    this.#options = options;
    const sandbox = options.config.sandbox;
    this.#failClosed = sandbox?.failClosed !== false;
    this.#idleMs = sandbox?.idleMs ?? 600_000;
    this.#provider =
      options.sandboxProvider ??
      resolveProvider(sandbox?.provider ?? "e2b");
  }

  get id(): string {
    return this.#local.id;
  }

  get workspaceRoot(): string {
    return this.#local.workspaceRoot;
  }

  get filesystem() {
    return this.#local.filesystem;
  }

  get browser() {
    return this.#local.browser;
  }

  get terminal(): Terminal {
    return {
      exec: (command, opts) => this.#execInSandbox(command, opts),
    };
  }

  get sandboxInfo() {
    return this.#session?.info ?? null;
  }

  async #execInSandbox(
    command: string,
    options?: TerminalOptions,
  ): Promise<TerminalResult> {
    const session = await this.#ensureSession();
    await session.keepAlive().catch(() => {});
    await session.syncFromLocal(this.workspaceRoot);
    const result = await session.exec(command, {
      ...options,
      cwd: options?.cwd
        ? joinRemote(session.info.remoteWorkspace, options.cwd)
        : session.info.remoteWorkspace,
    });
    await session.syncToLocal(this.workspaceRoot).catch(() => {});
    const secrets = collectSecretValues(this.#options.secrets);
    return {
      ...result,
      stdout: scrubSecretsFromText(result.stdout, secrets),
      stderr: scrubSecretsFromText(result.stderr, secrets),
    };
  }

  async #ensureSession(): Promise<SandboxSession> {
    if (this.#session) return this.#session;
    if (this.#sessionPromise) return this.#sessionPromise;

    this.#sessionPromise = (async () => {
      const apiKey = resolveApiKey(
        this.#provider.id,
        this.#options.secrets,
      );
      if (!apiKey) {
        const msg = `Sandbox provider "${this.#provider.id}" requires an API key. Add it in Settings (or set the env var). Host shell fallback is disabled for security.`;
        if (this.#failClosed) throw new Error(msg);
        throw new Error(msg);
      }
      const session = await this.#provider.create({
        apiKey,
        timeoutMs: this.#idleMs,
        metadata: { agent: this.id },
      });
      this.#session = session;
      return session;
    })();

    try {
      return await this.#sessionPromise;
    } catch (error) {
      this.#sessionPromise = null;
      throw error;
    }
  }

  async dispose(): Promise<void> {
    if (this.#session) {
      await this.#session.dispose().catch(() => {});
      this.#session = null;
    }
    this.#sessionPromise = null;
    await this.#local.dispose();
  }
}

export function createAgentComputer(
  options: SandboxComputerOptions,
): Computer {
  const sandbox = options.config.sandbox;
  if (sandbox?.enabled && sandbox.provider !== "local") {
    return new SandboxComputer(options);
  }
  return new LocalComputer(options);
}

function resolveProvider(id: string): SandboxProvider {
  if (id === "fake") return new FakeSandboxProvider();
  if (id === "daytona") {
    throw new Error(
      "Daytona sandbox is not implemented yet. Use provider \"e2b\" or local.",
    );
  }
  return new E2bSandboxProvider();
}

function resolveApiKey(
  providerId: string,
  secrets?: { providers?: Record<string, { apiKey?: string }> },
): string | null {
  if (providerId === "fake") return "fake-key";
  if (providerId === "e2b") return resolveE2bApiKey(secrets);
  return (
    secrets?.providers?.[providerId]?.apiKey?.trim() ||
    process.env[`${providerId.toUpperCase()}_API_KEY`]?.trim() ||
    null
  );
}

function joinRemote(root: string, relative: string): string {
  const rel = relative.replace(/\\/g, "/").replace(/^\.\//, "");
  if (rel.startsWith("/")) return rel;
  return `${root.replace(/\/$/, "")}/${rel}`;
}

/** @deprecated use E2bSandboxProvider */
export { resolveE2bApiKey } from "./e2b-provider.ts";
