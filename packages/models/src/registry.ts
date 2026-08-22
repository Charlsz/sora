import { MockProvider } from "./mock.ts";
import { OpenAICompatibleProvider } from "./openai-compatible.ts";
import { parseModelReference, type ModelProvider, type ModelReference } from "./types.ts";

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

  resolve(modelRef: string | ModelReference): { provider: ModelProvider; model: string; ref: ModelReference } {
    const ref = typeof modelRef === "string" ? parseModelReference(modelRef) : modelRef;
    return { provider: this.get(ref.provider), model: ref.model, ref };
  }

  list(): string[] {
    return [...this.#providers.keys()];
  }
}

/** Default registry: mock + openai + ollama + openrouter aliases. */
export function createDefaultProviderRegistry(): ProviderRegistry {
  const openai = new OpenAICompatibleProvider({ id: "openai" });
  const openrouter = new OpenAICompatibleProvider({
    id: "openrouter",
    apiKey: process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY,
    baseUrl: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/sora-runtime/sora",
      "X-Title": "Sora",
    },
  });
  const ollama = new OpenAICompatibleProvider({
    id: "ollama",
    apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
    baseUrl: `${(process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "")}/v1`,
  });

  return new ProviderRegistry([
    new MockProvider(),
    openai,
    openrouter,
    ollama,
  ]);
}
