/** Never put raw secrets into logs, SSE, or API responses. */
export function redactSecret(value: string | undefined | null): string | null {
  if (!value) return null;
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 3)}…${value.slice(-4)}`;
}

export function hasCredential(
  secrets: { providers: Record<string, { apiKey?: string }> },
  providerId: string,
  envKeys: string[] = [],
): { configured: boolean; fromEnv: boolean; hint: string | null } {
  const stored = secrets.providers[providerId]?.apiKey;
  if (stored?.trim()) {
    return { configured: true, fromEnv: false, hint: redactSecret(stored) };
  }
  for (const key of envKeys) {
    const env = process.env[key];
    if (env?.trim()) {
      return { configured: true, fromEnv: true, hint: "from env" };
    }
  }
  return { configured: false, fromEnv: false, hint: null };
}

export function resolveApiKey(
  secrets: { providers: Record<string, { apiKey?: string }> },
  providerId: string,
  envKeys: string[],
): string | null {
  const stored = secrets.providers[providerId]?.apiKey?.trim();
  if (stored) return stored;
  for (const key of envKeys) {
    const env = process.env[key]?.trim();
    if (env) return env;
  }
  return null;
}
