import { MockProvider } from "./mock.ts";
import { OpenAICompatibleProvider } from "./openai-compatible.ts";
import {
  PROVIDER_CATALOG,
  type ProviderCatalogEntry,
} from "./providers/catalog.ts";
import { CURATED_MODELS, type ModelOption } from "./providers/models.ts";
import {
  parseModelReference,
  type ModelProvider,
  type ModelReference,
} from "./types.ts";

export type ProviderSecretsInput = {
  providers: Record<string, { apiKey?: string; baseUrl?: string }>;
};

export type ProviderStatus = {
  id: string;
  name: string;
  description: string;
  configured: boolean;
  fromEnv: boolean;
  needsKey: boolean;
  baseUrl: string;
  allowCustomBaseUrl: boolean;
  docsUrl: string | null;
  hint: string | null;
  kind: "llm" | "infra";
};

export type ModelCatalogResponse = {
  providers: ProviderStatus[];
  models: Record<string, ModelOption[]>;
  defaultModel: string;
};

function resolveEnvKey(meta: ProviderCatalogEntry): string | undefined {
  if (!meta.envKey) return undefined;
  const direct = process.env[meta.envKey]?.trim();
  if (direct) return direct;
  if (meta.id === "openai") {
    return process.env.SORA_API_KEY?.trim();
  }
  if (meta.id === "google") {
    return process.env.GEMINI_API_KEY?.trim();
  }
  if (meta.id === "anthropic") {
    return process.env.OPENROUTER_API_KEY?.trim();
  }
  return undefined;
}

function createOpenAIProviders(): Map<string, OpenAICompatibleProvider> {
  const map = new Map<string, OpenAICompatibleProvider>();
  for (const meta of PROVIDER_CATALOG) {
    if (meta.id === "mock") continue;
    if (meta.kind === "infra") continue;
    map.set(
      meta.id,
      new OpenAICompatibleProvider({
        id: meta.id,
        apiKey: meta.id === "ollama" ? "ollama" : "",
        baseUrl: meta.defaultBaseUrl,
        defaultHeaders: meta.defaultHeaders,
      }),
    );
  }
  return map;
}

export class ProviderRegistry {
  #providers = new Map<string, ModelProvider>();
  #openai = createOpenAIProviders();

  constructor(providers: ModelProvider[] = []) {
    for (const provider of providers) {
      this.register(provider);
    }
    for (const [id, p] of this.#openai) {
      this.register(p);
    }
  }

  register(provider: ModelProvider): void {
    this.#providers.set(provider.id, provider);
  }

  get(id: string): ModelProvider {
    const provider = this.#providers.get(id);
    if (!provider) {
      throw new Error(
        `Unknown model provider "${id}". Registered: ${[...this.#providers.keys()].join(", ") || "(none)"}`,
      );
    }
    return provider;
  }

  resolve(
    modelRef: string | ModelReference,
  ): { provider: ModelProvider; model: string; ref: ModelReference } {
    const ref =
      typeof modelRef === "string" ? parseModelReference(modelRef) : modelRef;
    return { provider: this.get(ref.provider), model: ref.model, ref };
  }

  list(): string[] {
    return [...this.#providers.keys()];
  }

  applySecrets(secrets: ProviderSecretsInput): void {
    for (const meta of PROVIDER_CATALOG) {
      if (meta.id === "mock" || meta.kind === "infra") continue;
      const provider = this.#openai.get(meta.id);
      if (!provider) continue;

      const stored = secrets.providers[meta.id];
      const envKey = resolveEnvKey(meta);
      const apiKey =
        stored?.apiKey ??
        envKey ??
        (meta.id === "ollama" ? "ollama" : "");
      let baseUrl = stored?.baseUrl ?? meta.defaultBaseUrl;
      if (meta.id === "ollama") {
        baseUrl = `${(process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "")}/v1`;
      }
      provider.configure({ apiKey, baseUrl });
    }
  }

  status(secrets: ProviderSecretsInput): ProviderStatus[] {
    return PROVIDER_CATALOG.map((meta) => {
      if (meta.id === "mock") {
        return {
          id: meta.id,
          name: meta.name,
          description: meta.description,
          configured: true,
          fromEnv: false,
          needsKey: false,
          baseUrl: "",
          allowCustomBaseUrl: false,
          docsUrl: meta.docsUrl ?? null,
          hint: null,
          kind: "llm" as const,
        };
      }

      if (meta.kind === "infra") {
        const stored = secrets.providers[meta.id];
        const envVal = resolveEnvKey(meta);
        const fromEnv = Boolean(envVal && !stored?.apiKey);
        const hasKey = Boolean(stored?.apiKey || envVal);
        let hint: string | null = null;
        if (stored?.apiKey) {
          const k = stored.apiKey;
          hint = k.length <= 8 ? "••••" : `${k.slice(0, 3)}…${k.slice(-4)}`;
        } else if (fromEnv) {
          hint = "from env";
        }
        return {
          id: meta.id,
          name: meta.name,
          description: meta.description,
          configured: hasKey,
          fromEnv,
          needsKey: meta.needsKey,
          baseUrl: meta.defaultBaseUrl,
          allowCustomBaseUrl: false,
          docsUrl: meta.docsUrl ?? null,
          hint,
          kind: "infra" as const,
        };
      }

      const stored = secrets.providers[meta.id];
      const envVal = resolveEnvKey(meta);
      const fromEnv = Boolean(envVal && !stored?.apiKey);
      const hasKey = Boolean(stored?.apiKey || envVal) || !meta.needsKey;
      const provider = this.#openai.get(meta.id);
      const baseUrl =
        provider?.baseUrl ?? stored?.baseUrl ?? meta.defaultBaseUrl;

      let hint: string | null = null;
      if (stored?.apiKey) {
        const k = stored.apiKey;
        hint = k.length <= 8 ? "••••" : `${k.slice(0, 3)}…${k.slice(-4)}`;
      } else if (fromEnv) {
        hint = "from env";
      }

      return {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        configured: hasKey,
        fromEnv,
        needsKey: meta.needsKey,
        baseUrl,
        allowCustomBaseUrl: meta.allowCustomBaseUrl ?? false,
        docsUrl: meta.docsUrl ?? null,
        hint,
        kind: "llm" as const,
      };
    });
  }

  modelCatalog(secrets: ProviderSecretsInput): ModelCatalogResponse {
    return {
      providers: this.status(secrets),
      models: CURATED_MODELS,
      defaultModel: "",
    };
  }
}

export type CreateRegistryOptions = {
  secrets?: ProviderSecretsInput;
};

export function createDefaultProviderRegistry(
  options: CreateRegistryOptions = {},
): ProviderRegistry {
  const registry = new ProviderRegistry([new MockProvider()]);

  if (options.secrets) {
    registry.applySecrets(options.secrets);
  } else {
    registry.applySecrets({ providers: {} });
  }

  return registry;
}

/** @deprecated use PROVIDER_CATALOG */
export const CATALOG = PROVIDER_CATALOG;
