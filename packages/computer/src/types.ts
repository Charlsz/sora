/**
 * Computer is the teammate coworker surface.
 *
 * Control plane (API, chat, secrets, approvals, routines) stays local.
 * Where the Computer *runs* is a provider choice — not "web = cloud".
 *
 *   you → task → agent (local) → Computer (local | docker | e2b | vps | host)
 *                              → browser + fs + terminal [+ live display]
 */

export type FileStat = {
  path: string;
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
};

export interface Filesystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  appendFile(path: string, content: string): Promise<void>;
  listDir(path: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  stat(path: string): Promise<FileStat>;
}

export type TerminalResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
};

export type TerminalOptions = {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
};

export interface Terminal {
  exec(command: string, options?: TerminalOptions): Promise<TerminalResult>;
}

export type BrowserNavigateResult = {
  url: string;
  title: string;
  ok: boolean;
  message: string;
};

export type BrowserActionResult = {
  ok: boolean;
  message: string;
  url?: string;
};

export type BrowserScreenshotResult = {
  ok: boolean;
  message: string;
  /** Workspace-relative path when saved to disk. */
  path?: string;
  /** PNG as base64 (no data: prefix). */
  base64?: string;
  width: number;
  height: number;
};

export type BrowserStatus = {
  backend: "playwright" | "placeholder" | "remote-desktop";
  open: boolean;
  url: string;
  title: string;
  profileDir?: string;
  headed: boolean;
};

/**
 * Browser / GUI automation on the Computer.
 * Local: Playwright. Cloud desktop: provider CDP / xdotool / noVNC actions.
 */
export interface Browser {
  navigate(url: string): Promise<BrowserNavigateResult>;
  content(): Promise<string>;
  screenshot(options?: {
    path?: string;
    fullPage?: boolean;
  }): Promise<BrowserScreenshotResult>;
  click(selector: string): Promise<BrowserActionResult>;
  type(
    selector: string,
    text: string,
    options?: { clear?: boolean },
  ): Promise<BrowserActionResult>;
  close(): Promise<void>;
  status(): BrowserStatus;
}

/** Where the Computer process actually runs. */
export type ComputerProviderId =
  | "local"
  | "docker"
  | "e2b"
  | "daytona"
  | "remote"
  | "host"
  | "fake";

/**
 * Coarse placement for UI / telemetry.
 * Prefer `provider` for decisions — kind alone is not enough.
 */
export type ComputerKind =
  | "local"
  | "docker"
  | "cloud"
  | "remote"
  | "host"
  | "android";

export type ComputerCapabilities = {
  filesystem: boolean;
  terminal: boolean;
  browser: boolean;
  /** Live screen the user can watch (noVNC / stream / headed window). */
  display: boolean;
  /** Persistent login/profile across runs. */
  persistentProfile: boolean;
};

export type ComputerDisplayFrame = {
  /** PNG base64 (no data: prefix), or empty if stream URL is used. */
  base64?: string;
  width: number;
  height: number;
  /** Provider live-view URL (noVNC, etc.) — never embed secrets in the client. */
  streamUrl?: string;
  updatedAt: string;
};

/**
 * Optional watch surface — live Agent Computer preview.
 * Providers without a display return null / unsupported.
 */
export interface ComputerDisplay {
  /** Latest frame or stream pointer for the UI. */
  snapshot(): Promise<ComputerDisplayFrame | null>;
  /** Human takeover (type password / 2FA on the computer, not in chat). */
  requestTakeover?(): Promise<{ ok: boolean; message: string }>;
}

export interface Computer {
  readonly id: string;
  readonly kind: ComputerKind;
  /** Concrete backend (local Playwright, e2b desktop, docker, …). */
  readonly provider: ComputerProviderId;
  readonly workspaceRoot: string;
  readonly capabilities: ComputerCapabilities;
  filesystem: Filesystem;
  terminal: Terminal;
  browser: Browser;
  /** Present when the user can watch / take over the computer. */
  display?: ComputerDisplay;
}
