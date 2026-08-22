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
  backend: "playwright" | "placeholder";
  open: boolean;
  url: string;
  title: string;
  profileDir?: string;
  headed: boolean;
};

/**
 * Local browser computer. Prefer Playwright; placeholder when disabled.
 * Sessions persist via userDataDir so agents can stay signed in.
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

export type ComputerKind = "local" | "docker" | "cloud" | "android" | "remote";

export interface Computer {
  readonly id: string;
  readonly kind: ComputerKind;
  readonly workspaceRoot: string;
  filesystem: Filesystem;
  terminal: Terminal;
  browser: Browser;
}
