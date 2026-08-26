import {
  resolveComputerConfig,
  type SoraConfig,
} from "@sora/core";
import { LocalComputer, type LocalComputerOptions } from "../local.ts";
import {
  collectSecretValues,
  scrubSecretsFromText,
} from "../security/env.ts";
import type {
  Computer,
  ComputerCapabilities,
  ComputerDisplay,
  ComputerProviderId,
  Terminal,
  TerminalOptions,
  TerminalResult,
} from "../types.ts";
import { E2bSandboxProvider, resolveE2bApiKey } from "./e2b-provider.ts";
import { E2bDesktopProvider } from "./e2b-desktop-provider.ts";
import { DockerSandboxProvider } from "./docker-provider.ts";
import { FakeSandboxProvider } from "./fake-provider.ts";
import type { SandboxProvider, SandboxSession } from "./types.ts";

export type SandboxComputerOptions = LocalComputerOptions & {
  config: SoraConfig;
  secrets?: { providers?: Record<string, { apiKey?: string }> };
  /** Test hook — inject a session provider (e.g. FakeSandboxProvider). */
  sandboxProvider?: SandboxProvider;
};

/**
 * Non-local Computer backend: terminal (+ synced files) on a remote provider.
 * With preferDisplay + e2b, uses full desktop stream (@e2b/desktop).
 * Fail-closed: never silently use the host shell when this Computer is selected.
 */
export class SandboxComputer implements Computer {
  readonly #local: LocalComputer;
  readonly #options: SandboxComputerOptions;
  readonly #sessionBackend: SandboxProvider;
  readonly #failClosed: boolean;
  readonly #idleMs: number;
  readonly #preferDisplay: boolean;
  #session: SandboxSession | null = null;
  #sessionPromise: Promise<SandboxSession> | null = null;
  readonly kind = "cloud" as const;
  readonly provider: ComputerProviderId;
  readonly capabilities: ComputerCapabilities;

  constructor(options: SandboxComputerOptions) {
    this.#local = new LocalComputer(options);
    this.#options = options;
    const computer = resolveComputerConfig(options.config);
    this.provider = (computer.provider === "local"
      ? "e2b"
      : computer.provider) as ComputerProviderId;
    this.#failClosed = computer.failClosed !== false;
    this.#idleMs = computer.idleMs ?? 600_000;
    this.#preferDisplay = computer.preferDisplay !== false;
    this.#sessionBackend =
      options.sandboxProvider ??
      resolveProvider(this.provider, this.#preferDisplay);
    this.capabilities = {
      filesystem: true,
      terminal: true,
      browser: true,
      display: true,
      persistentProfile: true,
    };
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

  get display(): ComputerDisplay {
    if (this.#sessionBackend.capabilities.desktop) {
      return {
        snapshot: async () => {
          const session = await this.#ensureSession();
          await session.keepAlive().catch(() => {});
          const stream = await session.getStreamUrl?.();
          let base64: string | undefined;
          try {
            const bytes = await session.screenshotDesktop?.();
            if (bytes && bytes.length > 0) {
              base64 = Buffer.from(bytes).toString("base64");
            }
          } catch {
            /* stream-only is fine */
          }
          return {
            base64,
            streamUrl: stream?.url,
            width: 1280,
            height: 720,
            updatedAt: new Date().toISOString(),
          };
        },
        requestTakeover: async () => {
          const session = await this.#ensureSession();
          const stream = await session.getStreamUrl?.();
          if (!stream?.url) {
            return {
              ok: false,
              message: "Desktop stream is not available yet.",
            };
          }
          return {
            ok: true,
            message: stream.url,
          };
        },
      };
    }
    return this.#local.display!;
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
      const needsKey =
        this.#sessionBackend.id !== "docker" &&
        this.#sessionBackend.id !== "fake";
      const apiKey = resolveApiKey(
        this.#sessionBackend.id,
        this.#options.secrets,
      );
      if (needsKey && !apiKey) {
        throw new Error(
          `Computer provider "${this.#sessionBackend.id}" requires an API key. Add it in Settings. Host shell fallback is disabled.`,
        );
      }
      const session = await this.#sessionBackend.create({
        apiKey: apiKey ?? undefined,
        timeoutMs: this.#idleMs,
        metadata: {
          agent: this.id,
          localRoot: this.workspaceRoot,
        },
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
  const computer = resolveComputerConfig(options.config);
  if (computer.provider !== "local") {
    return new SandboxComputer(options);
  }
  return new LocalComputer(options);
}

function resolveProvider(
  id: string,
  preferDisplay = true,
): SandboxProvider {
  if (id === "fake") return new FakeSandboxProvider();
  if (id === "docker") return new DockerSandboxProvider();
  if (id === "daytona" || id === "remote" || id === "host") {
    throw new Error(
      `Computer provider "${id}" is not implemented yet. Use "local", "e2b", or "docker".`,
    );
  }
  // e2b + preferDisplay → full GUI desktop; preferDisplay:false → lean code sandbox
  if (id === "e2b" || id === "e2b-desktop") {
    return preferDisplay ? new E2bDesktopProvider() : new E2bSandboxProvider();
  }
  return preferDisplay ? new E2bDesktopProvider() : new E2bSandboxProvider();
}

function resolveApiKey(
  providerId: string,
  secrets?: { providers?: Record<string, { apiKey?: string }> },
): string | null {
  if (providerId === "fake") return "fake-key";
  if (providerId === "docker") return "docker-local";
  if (providerId === "e2b" || providerId === "e2b-desktop") {
    return resolveE2bApiKey(secrets);
  }
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

export { resolveE2bApiKey } from "./e2b-provider.ts";
