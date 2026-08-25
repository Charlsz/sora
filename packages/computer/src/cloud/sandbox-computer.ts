import type { SoraConfig } from "@sora/core";
import { LocalComputer, type LocalComputerOptions } from "../local.ts";
import type { Computer, Terminal } from "../types.ts";
import { E2bTerminal, resolveE2bApiKey } from "./e2b-terminal.ts";

export type SandboxComputerOptions = LocalComputerOptions & {
  config: SoraConfig;
  secrets?: { providers?: Record<string, { apiKey?: string }> };
};

/**
 * Wraps LocalComputer; routes terminal to E2B when sandbox is enabled.
 * Filesystem and browser stay local (local-first default).
 */
export class SandboxComputer implements Computer {
  readonly #local: LocalComputer;
  readonly #cloudTerminal: Terminal | null;
  readonly kind = "cloud" as const;

  constructor(options: SandboxComputerOptions) {
    this.#local = new LocalComputer(options);
    const sandbox = options.config.sandbox;
    if (sandbox?.enabled && sandbox.provider === "e2b") {
      const key = resolveE2bApiKey(options.secrets);
      this.#cloudTerminal = key ? new E2bTerminal(key) : null;
    } else {
      this.#cloudTerminal = null;
    }
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

  get terminal(): Terminal {
    return this.#cloudTerminal ?? this.#local.terminal;
  }

  get browser() {
    return this.#local.browser;
  }

  async dispose(): Promise<void> {
    if (this.#cloudTerminal instanceof E2bTerminal) {
      await this.#cloudTerminal.dispose();
    }
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
