import { MockProvider } from "./mock.ts";
import { OpenAICompatibleProvider } from "./openai-compatible.ts";
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
  /** Never the raw key — only a short mask when configured locally. */
  hint: string | null;
};

const CATALOG = [
  {
    id: "mock",
    name: "Mock (offline)",
    description: "Built-in echo model for tests — no key required",
    needsKey: false,
    defaultBaseUrl: "",
    envKey: "",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Official OpenAI API",
    needsKey: true,
    defaultBaseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "One key → many models (Claude, Gemini, Grok, …)",
    needsKey: true,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Local models — free on your machine",
    needsKey: false,
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    envKey: "OLLAMA_API_KEY",
  },
] as const;

export class ProviderRegistry {
  #providers = new Map<string, ModelProvider>();

  constructor(providers: ModelProvider[] = []) {
    for (const provider of providers) {
      this.register(provider);
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

  /** Apply persisted + env credentials; safe to call after Settings changes. */
  applySecrets(secrets: ProviderSecretsInput): void {
    for (const meta of CATALOG) {
      if (meta.id === "mock") continue;
      const provider = this.#providers.get(meta.id);
      if (!(provider instanceof OpenAICompatibleProvider)) continue;

      const stored = secrets.providers[meta.id];
      const envKey = meta.envKey
        ? (process.env[meta.envKey] ??
          (meta.id === "openai" ? process.env.SORA_API_KEY : undefined) ??
          (meta.id === "openrouter" ? process.env.OPENAI_API_KEY : undefined))
        : undefined;

      const apiKey = stored?.apiKey ?? envKey ?? (meta.id === "ollama" ? "ollama" : "");
      const baseUrl =
        stored?.baseUrl ??
        (meta.id === "ollama"
          ? `${(process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "")}/v1`
          : meta.defaultBaseUrl);

      provider.configure({ apiKey, baseUrl });
    }
  }

  status(secrets: ProviderSecretsInput): ProviderStatus[] {
    return CATALOG.map((meta) => {
      if (meta.id === "mock") {
        return {
          id: meta.id,
          name: meta.name,
          description: meta.description,
          configured: true,
          fromEnv: false,
          needsKey: false,
          baseUrl: "",
          hint: null,
        };
      }

      const stored = secrets.providers[meta.id];
      const envVal = meta.envKey ? process.env[meta.envKey] : undefined;
      const fromEnv = Boolean(envVal && !stored?.apiKey);
      const hasKey = Boolean(stored?.apiKey || envVal) || !meta.needsKey;
      const provider = this.#providers.get(meta.id);
      const baseUrl =
        (provider instanceof OpenAICompatibleProvider
          ? provider.baseUrl
          : undefined) ??
        stored?.baseUrl ??
        meta.defaultBaseUrl;

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
        hint,
      };
    });
  }
}

export type CreateRegistryOptions = {
  secrets?: ProviderSecretsInput;
};

/** Default registry: mock + openai + ollama + openrouter. */
export function createDefaultProviderRegistry(
  options: CreateRegistryOptions = {},
): ProviderRegistry {
  const openai = new OpenAICompatibleProvider({ id: "openai", apiKey: "" });
  const openrouter = new OpenAICompatibleProvider({
    id: "openrouter",
    apiKey: "",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/sora-runtime/sora",
      "X-Title": "Sora",
    },
  });
  const ollama = new OpenAICompatibleProvider({
    id: "ollama",
    apiKey: "ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
  });

  const registry = new ProviderRegistry([
    new MockProvider(),
    openai,
    openrouter,
    ollama,
  ]);

  if (options.secrets) {
    registry.applySecrets(options.secrets);
  } else {
    registry.applySecrets({
      version: 1,
      providers: {},
      updatedAt: new Date().toISOString(),
    });
  }

  return registry;
}
