export type SandboxProviderId = "local" | "e2b" | "daytona" | "fake";

export type SandboxConfig = {
  enabled: boolean;
  provider: SandboxProviderId;
  /**
   * When true (default), never fall back to the host shell if the cloud
   * sandbox cannot start. Safer for API-key isolation.
   */
  failClosed?: boolean;
  /** Destroy / idle-timeout the remote VM after this many ms (default 10m). */
  idleMs?: number;
  /** Max wall time for a single sandbox command (default 120s). */
  commandTimeoutMs?: number;
};

export type SoraConfig = {
  version: number;
  defaultModel: string;
  /** Browser automation: on tries Playwright; off uses placeholder. */
  browser?: "on" | "off";
  /** Optional cloud sandbox for isolated terminal + file sync (opt-in). */
  sandbox?: SandboxConfig;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_CONFIG: Omit<SoraConfig, "createdAt" | "updatedAt"> = {
  version: 1,
  /** Offline until the user connects a provider. */
  defaultModel: "mock:echo",
  browser: "on",
  sandbox: {
    enabled: false,
    provider: "local",
    failClosed: true,
    idleMs: 600_000,
    commandTimeoutMs: 120_000,
  },
};

export function createDefaultConfig(now = new Date()): SoraConfig {
  const iso = now.toISOString();
  return {
    ...DEFAULT_CONFIG,
    createdAt: iso,
    updatedAt: iso,
  };
}
