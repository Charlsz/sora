import { join } from "node:path";
import { createBrowser, PlaceholderBrowser } from "./browser.ts";
import { LocalFilesystem } from "./filesystem.ts";
import { LocalTerminal } from "./terminal.ts";
import type { Browser, Computer, Filesystem, Terminal } from "./types.ts";

export type LocalComputerOptions = {
  id?: string;
  workspaceRoot: string;
  /** Persistent browser profile directory (cookies / logins). */
  browserProfileDir?: string;
  browser?: Browser;
};

export class LocalComputer implements Computer {
  readonly id: string;
  readonly kind = "local" as const;
  readonly workspaceRoot: string;
  readonly filesystem: Filesystem;
  readonly terminal: Terminal;
  readonly browser: Browser;

  constructor(options: LocalComputerOptions) {
    this.id = options.id ?? `local:${options.workspaceRoot}`;
    this.workspaceRoot = options.workspaceRoot;
    const fs = new LocalFilesystem(options.workspaceRoot);
    this.filesystem = fs;
    this.terminal = new LocalTerminal(fs);
    this.browser =
      options.browser ??
      createBrowser({
        workspaceRoot: options.workspaceRoot,
        profileDir:
          options.browserProfileDir ??
          join(options.workspaceRoot, ".sora-browser-profile"),
      });
  }

  async dispose(): Promise<void> {
    await this.browser.close();
  }
}

export class ComputerRegistry {
  #computers = new Map<string, Computer>();

  register(computer: Computer): void {
    this.#computers.set(computer.id, computer);
  }

  get(id: string): Computer {
    const computer = this.#computers.get(id);
    if (!computer) throw new Error(`Unknown computer "${id}"`);
    return computer;
  }

  /** Return existing or create and register. */
  getOrCreate(id: string, factory: () => Computer): Computer {
    const existing = this.#computers.get(id);
    if (existing) return existing;
    const computer = factory();
    this.#computers.set(id, computer);
    return computer;
  }

  list(): Computer[] {
    return [...this.#computers.values()];
  }

  async disposeAll(): Promise<void> {
    for (const computer of this.#computers.values()) {
      if ("dispose" in computer && typeof computer.dispose === "function") {
        await (computer as LocalComputer).dispose();
      } else {
        await computer.browser.close();
      }
    }
    this.#computers.clear();
  }
}

export { PlaceholderBrowser };
