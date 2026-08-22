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

/** Placeholder until Phase 7 browser implementation. */
export interface Browser {
  navigate(url: string): Promise<BrowserNavigateResult>;
  content(): Promise<string>;
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
