import { PlaceholderBrowser } from "./browser.ts";
import { LocalFilesystem } from "./filesystem.ts";
import { LocalTerminal } from "./terminal.ts";
import type { Browser, Computer, Filesystem, Terminal } from "./types.ts";

export type LocalComputerOptions = {
  id?: string;
  workspaceRoot: string;
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
    this.browser = new PlaceholderBrowser();
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

  list(): Computer[] {
    return [...this.#computers.values()];
  }
}
