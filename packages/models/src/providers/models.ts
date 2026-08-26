/**
 * Curated model lists for the Settings model picker.
 * Users can always type a custom model id; these are sensible defaults.
 */

export type ModelOption = {
  id: string;
  name: string;
  description?: string;
};

export const CURATED_MODELS: Record<string, ModelOption[]> = {
  mock: [{ id: "echo", name: "Echo", description: "Offline test model" }],
  ollama: [
    { id: "llama3.2", name: "Llama 3.2", description: "Meta, local" },
    { id: "mistral", name: "Mistral", description: "Mistral AI, local" },
    { id: "qwen2.5", name: "Qwen 2.5", description: "Alibaba, local" },
    { id: "phi3", name: "Phi-3", description: "Microsoft, local" },
  ],
  openai: [
    { id: "gpt-4o-mini", name: "GPT-4o mini", description: "Fast, capable" },
    { id: "gpt-4o", name: "GPT-4o", description: "Flagship multimodal" },
    { id: "o3-mini", name: "o3-mini", description: "Reasoning, smaller" },
  ],
  anthropic: [
    {
      id: "claude-sonnet-4-5",
      name: "Claude Sonnet 4.5",
      description: "Balanced Claude",
    },
    {
      id: "claude-opus-4-5",
      name: "Claude Opus 4.5",
      description: "Strongest Claude",
    },
    {
      id: "claude-3-5-haiku-latest",
      name: "Claude 3.5 Haiku",
      description: "Fast Claude",
    },
  ],
  google: [
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", description: "Fast" },
    {
      id: "gemini-2.0-flash-lite",
      name: "Gemini 2.0 Flash Lite",
      description: "Lightweight",
    },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", description: "Long context" },
  ],
  xai: [
    { id: "grok-2", name: "Grok 2", description: "xAI flagship" },
    { id: "grok-2-mini", name: "Grok 2 mini", description: "Faster Grok" },
  ],
  groq: [
    {
      id: "llama-3.3-70b-versatile",
      name: "Llama 3.3 70B",
      description: "Groq-hosted",
    },
    {
      id: "mixtral-8x7b-32768",
      name: "Mixtral 8x7B",
      description: "Groq-hosted",
    },
  ],
  together: [
    {
      id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      name: "Llama 3.3 70B Turbo",
    },
    {
      id: "Qwen/Qwen2.5-72B-Instruct-Turbo",
      name: "Qwen 2.5 72B Turbo",
    },
  ],
  azure: [
    {
      id: "gpt-4o",
      name: "gpt-4o (deployment name)",
      description: "Use your Azure deployment id",
    },
  ],
  openrouter: [
    {
      id: "openai/gpt-4o-mini",
      name: "GPT-4o mini",
      description: "OpenAI via OpenRouter",
    },
    {
      id: "anthropic/claude-sonnet-4",
      name: "Claude Sonnet 4",
      description: "Anthropic via OpenRouter",
    },
    {
      id: "google/gemini-2.0-flash-001",
      name: "Gemini 2.0 Flash",
      description: "Google via OpenRouter",
    },
    {
      id: "x-ai/grok-2",
      name: "Grok 2",
      description: "xAI via OpenRouter",
    },
    {
      id: "meta-llama/llama-3.3-70b-instruct",
      name: "Llama 3.3 70B",
      description: "Meta via OpenRouter",
    },
  ],
};

/** Flat list for combined pickers. */
export function listAllModelRefs(): Array<ModelOption & { provider: string }> {
  const out: Array<ModelOption & { provider: string }> = [];
  for (const [provider, models] of Object.entries(CURATED_MODELS)) {
    for (const m of models) {
      out.push({ ...m, provider });
    }
  }
  return out;
}

export function formatModelRef(provider: string, modelId: string): string {
  return `${provider}:${modelId}`;
}
