import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createDefaultConfig, type SoraConfig } from "./config.ts";
import { openDatabase, type SoraDatabase } from "./db.ts";
import { EventBus } from "./events.ts";
import { getPaths, type SoraPaths } from "./paths.ts";

export type RuntimeOptions = {
  home?: string;
  events?: EventBus;
};

export class SoraRuntime {
  readonly paths: SoraPaths;
  readonly events: EventBus;
  #db: SoraDatabase | null = null;
  #config: SoraConfig | null = null;

  constructor(options: RuntimeOptions = {}) {
    this.paths = getPaths(options.home);
    this.events = options.events ?? new EventBus();
  }

  get db(): SoraDatabase {
    if (!this.#db) {
      throw new Error("Runtime not initialized. Call init() or ensureInitialized() first.");
    }
    return this.#db;
  }

  get config(): SoraConfig {
    if (!this.#config) {
      throw new Error("Runtime not initialized. Call init() or ensureInitialized() first.");
    }
    return this.#config;
  }

  get isInitialized(): boolean {
    return existsSync(this.paths.config) && existsSync(this.paths.database);
  }

  /** Create ~/.sora layout and default config if missing. */
  init(force = false): SoraConfig {
    if (this.isInitialized && !force) {
      return this.ensureInitialized();
    }

    mkdirSync(this.paths.home, { recursive: true });
    mkdirSync(this.paths.databaseDir, { recursive: true });
    mkdirSync(this.paths.agents, { recursive: true });
    mkdirSync(this.paths.skills, { recursive: true });
    mkdirSync(this.paths.logs, { recursive: true });

    const config = createDefaultConfig();
    writeFileSync(this.paths.config, JSON.stringify(config, null, 2) + "\n");

    this.#config = config;
    this.#db = openDatabase(this.paths.database);
    void this.events.emit("runtime.started", { home: this.paths.home }, "runtime");
    return config;
  }

  ensureInitialized(): SoraConfig {
    if (!existsSync(this.paths.config)) {
      throw new Error(
        `Sora is not initialized at ${this.paths.home}. Run: bun run sora init`,
      );
    }

    const raw = readFileSync(this.paths.config, "utf8");
    this.#config = JSON.parse(raw) as SoraConfig;
    this.#db ??= openDatabase(this.paths.database);
    return this.#config;
  }

  updateConfig(patch: Partial<Pick<SoraConfig, "defaultModel">>): SoraConfig {
    this.ensureInitialized();
    const next: SoraConfig = {
      ...this.config,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(this.paths.config, JSON.stringify(next, null, 2) + "\n");
    this.#config = next;
    return next;
  }

  close(): void {
    this.#db?.close();
    this.#db = null;
    void this.events.emit("runtime.stopped", {}, "runtime");
  }
}
