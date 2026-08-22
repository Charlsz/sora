import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type ProviderCredential = {
  apiKey?: string;
  baseUrl?: string;
};

export type SoraSecrets = {
  version: 1;
  providers: Record<string, ProviderCredential>;
  updatedAt: string;
};

export const EMPTY_SECRETS = (): SoraSecrets => ({
  version: 1,
  providers: {},
  updatedAt: new Date().toISOString(),
});

/** Built-in provider ids users can configure. */
export const KNOWN_PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    description: "Official OpenAI API (GPT-4o, etc.)",
    defaultBaseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    needsKey: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "One key for many models (Claude, Gemini, Grok, …)",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
    needsKey: true,
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Local models on your machine — free",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    envKey: "OLLAMA_API_KEY",
    needsKey: false,
  },
] as const;

export function loadSecrets(path: string): SoraSecrets {
  if (!existsSync(path)) return EMPTY_SECRETS();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as SoraSecrets;
    return {
      version: 1,
      providers: raw.providers ?? {},
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return EMPTY_SECRETS();
  }
}

export function saveSecrets(path: string, secrets: SoraSecrets): void {
  mkdirSync(dirname(path), { recursive: true });
  const next: SoraSecrets = {
    ...secrets,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
}

export function maskSecret(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 3)}…${value.slice(-4)}`;
}
