export type ComputerProviderId =
  | "local"
  | "docker"
  | "e2b"
  | "daytona"
  | "remote"
  | "host"
  | "fake";

/**
 * Where each agent's Computer runs.
 * Control plane stays local; this only selects the coworker machine backend.
 */
export type ComputerConfig = {
  /**
   * Backend for new agent computers.
   * - local: Playwright + workspace on this machine (default)
   * - docker: isolated Linux computer on this machine (planned)
   * - e2b: cloud microVM / desktop (opt-in key)
   * - daytona: cloud workspace (planned)
   * - remote: user VPS / SSH computer (planned)
   * - host: explicit opt-in control of the user's real desktop (planned, high risk)
   */
  provider: ComputerProviderId;
  /**
   * When true (default for non-local), never silently fall back to the host
   * shell/browser if the provider cannot start.
   */
  failClosed?: boolean;
  /** Idle timeout for remote/cloud computers (ms). */
  idleMs?: number;
  /** Max wall time for a single terminal command (ms). */
  commandTimeoutMs?: number;
  /**
   * Prefer a full desktop stream (watch the computer) when the provider
   * supports it. Code-only sandboxes ignore this.
   */
  preferDisplay?: boolean;
};

/** @deprecated use ComputerConfig — kept for existing config.json files */
export type SandboxConfig = {
  enabled: boolean;
  provider: ComputerProviderId;
  failClosed?: boolean;
  idleMs?: number;
  commandTimeoutMs?: number;
};

export type SoraConfig = {
  version: number;
  defaultModel: string;
  /**
   * Local display name for the human user (not an account).
   * Stored only in ~/.sora/config.json.
   */
  displayName?: string;
  /** Local Playwright when computer.provider is local. */
  browser?: "on" | "off";
  /**
   * Default Computer backend for agents.
   * Prefer this over legacy `sandbox`.
   */
  computer?: ComputerConfig;
  /**
   * @deprecated Migrated into `computer` on load.
   * enabled+e2b → computer.provider=e2b; else local.
   */
  sandbox?: SandboxConfig;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_COMPUTER: ComputerConfig = {
  provider: "e2b",
  failClosed: true,
  idleMs: 600_000,
  commandTimeoutMs: 120_000,
  /** Full cloud desktop VM — each bot gets an isolated sandbox computer. */
  preferDisplay: true,
};

export const DEFAULT_CONFIG: Omit<SoraConfig, "createdAt" | "updatedAt"> = {
  version: 1,
  defaultModel: "openrouter:openai/gpt-4o-mini",
  browser: "on",
  computer: { ...DEFAULT_COMPUTER },
};

export function createDefaultConfig(now = new Date()): SoraConfig {
  const iso = now.toISOString();
  return {
    ...DEFAULT_CONFIG,
    computer: { ...DEFAULT_COMPUTER },
    createdAt: iso,
    updatedAt: iso,
  };
}

/** Normalize legacy sandbox → computer for callers. */
export function resolveComputerConfig(config: SoraConfig): ComputerConfig {
  if (config.computer?.provider) {
    return {
      ...DEFAULT_COMPUTER,
      ...config.computer,
    };
  }
  const sandbox = config.sandbox;
  if (sandbox?.enabled && sandbox.provider && sandbox.provider !== "local") {
    return {
      ...DEFAULT_COMPUTER,
      provider: sandbox.provider,
      failClosed: sandbox.failClosed ?? true,
      idleMs: sandbox.idleMs ?? DEFAULT_COMPUTER.idleMs,
      commandTimeoutMs:
        sandbox.commandTimeoutMs ?? DEFAULT_COMPUTER.commandTimeoutMs,
    };
  }
  return { ...DEFAULT_COMPUTER };
}
