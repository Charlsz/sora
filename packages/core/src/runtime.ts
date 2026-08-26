import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  createDefaultConfig,
  resolveComputerConfig,
  type SoraConfig,
} from "./config.ts";
import { openDatabase, type SoraDatabase } from "./db.ts";
import { EventBus } from "./events.ts";
import { getPaths, type SoraPaths } from "./paths.ts";
import {
  loadSecrets,
  saveSecrets,
  type ProviderCredential,
  type SoraSecrets,
} from "./secrets.ts";

export type RuntimeOptions = {
  home?: string;
  events?: EventBus;
};

export class SoraRuntime {
  readonly paths: SoraPaths;
  readonly events: EventBus;
  #db: SoraDatabase | null = null;
  #config: SoraConfig | null = null;
  #secrets: SoraSecrets | null = null;

  constructor(options: RuntimeOptions = {}) {
    this.paths = getPaths(options.home);
    this.events = options.events ?? new EventBus();
  }

  get db(): SoraDatabase {
    if (!this.#db) {
      throw new Error(
        "Runtime not initialized. Call init() or ensureInitialized() first.",
      );
    }
    return this.#db;
  }

  get config(): SoraConfig {
    if (!this.#config) {
      throw new Error(
        "Runtime not initialized. Call init() or ensureInitialized() first.",
      );
    }
    return this.#config;
  }

  get secrets(): SoraSecrets {
    if (!this.#secrets) {
      throw new Error(
        "Runtime not initialized. Call init() or ensureInitialized() first.",
      );
    }
    return this.#secrets;
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
    if (!existsSync(this.paths.secrets)) {
      saveSecrets(this.paths.secrets, {
        version: 1,
        providers: {},
        updatedAt: new Date().toISOString(),
      });
    }

    this.#config = config;
    this.#secrets = loadSecrets(this.paths.secrets);
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
    this.#secrets = loadSecrets(this.paths.secrets);
    this.#applyBrowserMode(this.#config.browser);
    this.#db ??= openDatabase(this.paths.database);
    return this.#config;
  }

  updateConfig(
    patch: Partial<
      Pick<
        SoraConfig,
        "defaultModel" | "browser" | "sandbox" | "computer" | "displayName"
      >
    >,
  ): SoraConfig {
    this.ensureInitialized();
    const next: SoraConfig = {
      ...this.config,
      ...patch,
      computer: patch.computer
        ? {
            ...resolveComputerConfig(this.config),
            ...patch.computer,
          }
        : patch.sandbox
          ? resolveComputerConfig({
              ...this.config,
              sandbox: {
                ...(this.config.sandbox ?? {
                  enabled: false,
                  provider: "local",
                }),
                ...patch.sandbox,
              },
            })
          : this.config.computer ?? resolveComputerConfig(this.config),
      sandbox: patch.sandbox
        ? {
            enabled: patch.sandbox.enabled ?? this.config.sandbox?.enabled ?? false,
            provider:
              patch.sandbox.provider ??
              this.config.sandbox?.provider ??
              "local",
            failClosed:
              patch.sandbox.failClosed ?? this.config.sandbox?.failClosed,
            idleMs: patch.sandbox.idleMs ?? this.config.sandbox?.idleMs,
            commandTimeoutMs:
              patch.sandbox.commandTimeoutMs ??
              this.config.sandbox?.commandTimeoutMs,
          }
        : this.config.sandbox,
      updatedAt: new Date().toISOString(),
    };
    // Keep computer + legacy sandbox in sync when either is patched
    if (patch.computer && !patch.sandbox) {
      next.sandbox = {
        enabled: next.computer!.provider !== "local",
        provider: next.computer!.provider,
        failClosed: next.computer!.failClosed,
        idleMs: next.computer!.idleMs,
        commandTimeoutMs: next.computer!.commandTimeoutMs,
      };
    }
    writeFileSync(this.paths.config, JSON.stringify(next, null, 2) + "\n");
    this.#config = next;
    this.#applyBrowserMode(next.browser);
    return next;
  }

  /** Apply browser mode from config to process env for computer tools. */
  #applyBrowserMode(mode?: SoraConfig["browser"]): void {
    const browser = mode ?? this.config.browser ?? "on";
    process.env.SORA_BROWSER = browser === "off" ? "off" : "on";
  }

  /** Upsert provider credentials. Empty apiKey string clears the stored key. */
  setProviderCredential(
    providerId: string,
    patch: ProviderCredential,
  ): SoraSecrets {
    this.ensureInitialized();
    const providers = { ...this.secrets.providers };
    const current = providers[providerId] ?? {};
    const nextCred: ProviderCredential = { ...current };

    if (patch.apiKey !== undefined) {
      if (patch.apiKey.trim() === "") delete nextCred.apiKey;
      else nextCred.apiKey = patch.apiKey.trim();
    }
    if (patch.baseUrl !== undefined) {
      if (patch.baseUrl.trim() === "") delete nextCred.baseUrl;
      else nextCred.baseUrl = patch.baseUrl.trim().replace(/\/$/, "");
    }
    if (patch.username !== undefined) {
      if (patch.username.trim() === "") delete nextCred.username;
      else nextCred.username = patch.username.trim();
    }

    if (!nextCred.apiKey && !nextCred.baseUrl && !nextCred.username) {
      delete providers[providerId];
    } else {
      providers[providerId] = nextCred;
    }

    const next: SoraSecrets = {
      version: 1,
      providers,
      updatedAt: new Date().toISOString(),
    };
    saveSecrets(this.paths.secrets, next);
    this.#secrets = next;
    return next;
  }

  clearProviderCredential(providerId: string): SoraSecrets {
    this.ensureInitialized();
    const providers = { ...this.secrets.providers };
    delete providers[providerId];
    const next: SoraSecrets = {
      version: 1,
      providers,
      updatedAt: new Date().toISOString(),
    };
    saveSecrets(this.paths.secrets, next);
    this.#secrets = next;
    return next;
  }

  close(): void {
    this.#db?.close();
    this.#db = null;
    void this.events.emit("runtime.stopped", {}, "runtime");
  }
}
