import type { TerminalOptions, TerminalResult } from "../types.ts";

/**
 * Lean sandbox contract (shell + files; not a full GUI desktop).
 * Sora default: isolated shell + files in a microVM; browser stays local.
 * Provider API keys stay on the host — never injected into the sandbox env.
 */
export type SandboxCapabilities = {
  shell: boolean;
  files: boolean;
  /** Full GUI desktop stream — not required for v1 lean sandbox. */
  desktop: boolean;
};

export type SandboxSessionInfo = {
  id: string;
  provider: string;
  /** Absolute path inside the sandbox where the agent workspace is mirrored. */
  remoteWorkspace: string;
  capabilities: SandboxCapabilities;
};

export type SandboxCreateOptions = {
  /** Host-only API key for the provider. Never forwarded into sandbox env. */
  apiKey?: string;
  /** Idle timeout for the remote machine (cost control). */
  timeoutMs?: number;
  /** Metadata for provider dashboards / local paths. */
  metadata?: Record<string, string>;
};

export interface SandboxSession {
  readonly info: SandboxSessionInfo;
  exec(command: string, options?: TerminalOptions): Promise<TerminalResult>;
  writeFile(remotePath: string, content: string | Uint8Array): Promise<void>;
  readFile(remotePath: string): Promise<string>;
  /** Upload local workspace tree into remoteWorkspace (delta-friendly when possible). */
  syncFromLocal(localRoot: string): Promise<{ files: number }>;
  /** Download remoteWorkspace back to localRoot. */
  syncToLocal(localRoot: string): Promise<{ files: number }>;
  /** Extend idle TTL (call around agent activity). */
  keepAlive(): Promise<void>;
  dispose(): Promise<void>;
  /** Live desktop stream (E2B Desktop / noVNC). */
  getStreamUrl?(): Promise<{ url: string } | null>;
  /** Full-desktop PNG bytes for Watch. */
  screenshotDesktop?(): Promise<Uint8Array | null>;
}

export interface SandboxProvider {
  readonly id: string;
  readonly capabilities: SandboxCapabilities;
  create(options: SandboxCreateOptions): Promise<SandboxSession>;
}
