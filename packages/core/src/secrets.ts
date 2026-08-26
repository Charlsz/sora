import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type ProviderCredential = {
  apiKey?: string;
  baseUrl?: string;
  /** Optional handle (e.g. botdirectory.ai username). */
  username?: string;
};

/** User-labeled secrets (passwords, emails) — never returned raw by the API. */
export type VaultEntry = {
  id: string;
  label: string;
  value: string;
  kind: "password" | "email" | "api_key" | "other";
  updatedAt: string;
};

export type SoraSecrets = {
  version: 1;
  providers: Record<string, ProviderCredential>;
  vault?: VaultEntry[];
  updatedAt: string;
};

/** On-disk envelope when secrets are encrypted at rest. */
type EncryptedSecretsFile = {
  version: 2;
  algo: "aes-256-gcm";
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

export const EMPTY_SECRETS = (): SoraSecrets => ({
  version: 1,
  providers: {},
  vault: [],
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

export function encryptionKeyFromEnv(): string | null {
  const key = process.env.SORA_ENCRYPTION_KEY?.trim();
  return key || null;
}

/** Path to the machine-local key used when SORA_ENCRYPTION_KEY is unset. */
export function encryptionKeyPath(secretsPath: string): string {
  return join(dirname(secretsPath), ".encryption-key");
}

/**
 * Prefer SORA_ENCRYPTION_KEY; otherwise use (or create) ~/.sora/.encryption-key.
 * Secrets are encrypted at rest by default on desktop.
 */
export function resolveEncryptionPassphrase(secretsPath: string): string {
  const fromEnv = encryptionKeyFromEnv();
  if (fromEnv) return fromEnv;

  const keyPath = encryptionKeyPath(secretsPath);
  if (existsSync(keyPath)) {
    const existing = readFileSync(keyPath, "utf8").trim();
    if (existing) return existing;
  }
  mkdirSync(dirname(keyPath), { recursive: true });
  const generated = randomBytes(32).toString("base64");
  writeFileSync(keyPath, generated + "\n", { mode: 0o600 });
  return generated;
}

export function loadSecrets(path: string): SoraSecrets {
  if (!existsSync(path)) return EMPTY_SECRETS();
  try {
    const text = readFileSync(path, "utf8");
    const parsed = JSON.parse(text) as SoraSecrets | EncryptedSecretsFile;
    if (isEncrypted(parsed)) {
      const key = resolveEncryptionPassphrase(path);
      return normalizeSecrets(decryptSecrets(parsed, key));
    }
    return normalizeSecrets(parsed as SoraSecrets);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("SORA_ENCRYPTION_KEY") ||
        error.message.includes("Unsupported state") ||
        error.message.includes("bad decrypt"))
    ) {
      throw error;
    }
    return EMPTY_SECRETS();
  }
}

export function saveSecrets(path: string, secrets: SoraSecrets): void {
  mkdirSync(dirname(path), { recursive: true });
  const next = normalizeSecrets({
    ...secrets,
    version: 1,
    updatedAt: new Date().toISOString(),
  });
  const key = resolveEncryptionPassphrase(path);
  const payload =
    JSON.stringify(encryptSecrets(next, key), null, 2) + "\n";
  writeFileSync(path, payload, { mode: 0o600 });
}

export function maskSecret(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 3)}…${value.slice(-4)}`;
}

export function publicVaultEntries(
  secrets: SoraSecrets,
): Array<{
  id: string;
  label: string;
  kind: VaultEntry["kind"];
  hint: string | null;
  updatedAt: string;
}> {
  return (secrets.vault ?? []).map((e) => ({
    id: e.id,
    label: e.label,
    kind: e.kind,
    hint: maskSecret(e.value),
    updatedAt: e.updatedAt,
  }));
}

function normalizeSecrets(parsed: SoraSecrets): SoraSecrets {
  return {
    version: 1,
    providers: parsed.providers ?? {},
    vault: Array.isArray(parsed.vault) ? parsed.vault : [],
    updatedAt: parsed.updatedAt ?? new Date().toISOString(),
  };
}

function isEncrypted(value: unknown): value is EncryptedSecretsFile {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as EncryptedSecretsFile).version === 2 &&
    (value as EncryptedSecretsFile).algo === "aes-256-gcm"
  );
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  // N=16384 is interactive-login cost; fine for desktop secrets at rest.
  return scryptSync(passphrase, salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
}

export function encryptSecrets(
  secrets: SoraSecrets,
  passphrase: string,
): EncryptedSecretsFile {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(secrets), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 2,
    algo: "aes-256-gcm",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptSecrets(
  file: EncryptedSecretsFile,
  passphrase: string,
): SoraSecrets {
  const salt = Buffer.from(file.salt, "base64");
  const iv = Buffer.from(file.iv, "base64");
  const tag = Buffer.from(file.tag, "base64");
  const ciphertext = Buffer.from(file.ciphertext, "base64");
  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
  return normalizeSecrets(JSON.parse(plain) as SoraSecrets);
}
