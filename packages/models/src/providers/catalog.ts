/**
 * Provider catalog — single source of truth for model backends.
 * Most vendors expose an OpenAI-compatible chat API; register them here.
 */

export type ProviderCatalogEntry = {
  id: string;
  name: string;
  description: string;
  needsKey: boolean;
  defaultBaseUrl: string;
  envKey: string;
  /** Extra headers for aggregators (OpenRouter, etc.). */
  defaultHeaders?: Record<string, string>;
  /** Show base URL field in Settings (Azure, custom proxies). */
  allowCustomBaseUrl?: boolean;
  docsUrl?: string;
  /** llm (default) vs infra keys (sandbox providers — not chat models). */
  kind?: "llm" | "infra";
};

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: "mock",
    name: "Mock (offline)",
    description: "Built-in echo model for tests — no key required",
    needsKey: false,
    defaultBaseUrl: "",
    envKey: "",
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Local models on your machine — free, private",
    needsKey: false,
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    envKey: "OLLAMA_API_KEY",
    docsUrl: "https://ollama.com",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, o-series, and other OpenAI models",
    needsKey: true,
    defaultBaseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    docsUrl: "https://platform.openai.com",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models via Anthropic-compatible gateway (OpenRouter or custom base URL)",
    needsKey: true,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    envKey: "ANTHROPIC_API_KEY",
    allowCustomBaseUrl: true,
    docsUrl: "https://docs.anthropic.com",
  },
  {
    id: "google",
    name: "Google AI (Gemini)",
    description: "Gemini models via Google's OpenAI-compatible endpoint",
    needsKey: true,
    defaultBaseUrl:
      "https://generativelanguage.googleapis.com/v1beta/openai",
    envKey: "GOOGLE_API_KEY",
    docsUrl: "https://ai.google.dev",
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    description: "Grok models from xAI",
    needsKey: true,
    defaultBaseUrl: "https://api.x.ai/v1",
    envKey: "XAI_API_KEY",
    docsUrl: "https://docs.x.ai",
  },
  {
    id: "e2b",
    name: "E2B (sandbox)",
    description:
      "Cloud microVM for isolated shell + files — API key stays on your machine, never inside the VM",
    needsKey: true,
    defaultBaseUrl: "https://api.e2b.dev",
    envKey: "E2B_API_KEY",
    docsUrl: "https://e2b.dev/docs",
    kind: "infra",
  },
  {
    id: "groq",
    name: "Groq",
    description: "Fast inference for Llama, Mixtral, and other open models",
    needsKey: true,
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    envKey: "GROQ_API_KEY",
    docsUrl: "https://console.groq.com",
  },
  {
    id: "together",
    name: "Together AI",
    description: "Open-source and frontier models on Together",
    needsKey: true,
    defaultBaseUrl: "https://api.together.xyz/v1",
    envKey: "TOGETHER_API_KEY",
    docsUrl: "https://docs.together.ai",
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    description: "Your Azure OpenAI resource (set base URL to your deployment endpoint)",
    needsKey: true,
    defaultBaseUrl: "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT",
    envKey: "AZURE_OPENAI_API_KEY",
    allowCustomBaseUrl: true,
    docsUrl: "https://learn.microsoft.com/azure/ai-services/openai",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "One key for Claude, Gemini, Grok, Llama, Mistral, and more",
    needsKey: true,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/sora-runtime/sora",
      "X-Title": "Sora",
    },
    docsUrl: "https://openrouter.ai/models",
  },
];

export function getProviderCatalogEntry(
  id: string,
): ProviderCatalogEntry | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === id);
}

export function listConfigurableProviders(): ProviderCatalogEntry[] {
  return PROVIDER_CATALOG.filter((p) => p.id !== "mock");
}
