/**
 * Host process env must never flow into agent shells (local or cloud).
 * LLM / connector API keys live on the host only.
 */

const UNIX_SAFE = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "COLORTERM",
  "NO_COLOR",
  "FORCE_COLOR",
  "SHELL",
] as const;

const WINDOWS_SAFE = [
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "SYSTEMROOT",
  "COMSPEC",
  "TEMP",
  "TMP",
  "USERNAME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "ProgramData",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "OS",
  "ComSpec",
] as const;

/** Keys that look like credentials — never pass into a sandbox or agent shell. */
const FORBIDDEN_ENV =
  /(?:^|_)(API[_-]?KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|AUTH)(?:_|$)|^(OPENAI|ANTHROPIC|OPENROUTER|GEMINI|GOOGLE|XAI|GROQ|AZURE|TOGETHER|E2B|DAYTONA|COMPOSIO|PIPEDREAM|GITHUB|SORA)_/i;

export function isForbiddenEnvKey(key: string): boolean {
  return FORBIDDEN_ENV.test(key);
}

/**
 * Minimal env for spawning a local shell. Host secrets are excluded.
 * Optional `extra` is filtered the same way (agents cannot inject API keys).
 */
export function buildSafeProcessEnv(
  extra?: Record<string, string>,
): Record<string, string> {
  const allow =
    process.platform === "win32"
      ? [...WINDOWS_SAFE, ...UNIX_SAFE]
      : [...UNIX_SAFE];
  const out: Record<string, string> = {};
  for (const key of allow) {
    const value = process.env[key];
    if (value !== undefined && value !== "") {
      out[key] = value;
    }
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (isForbiddenEnvKey(key)) continue;
      out[key] = value;
    }
  }
  return out;
}

/** Collect secret strings to redact from tool output (never log raw keys). */
export function collectSecretValues(
  secrets?: {
    providers?: Record<string, { apiKey?: string }>;
    vault?: Array<{ value?: string }>;
  },
): string[] {
  const values: string[] = [];
  if (!secrets?.providers) {
    /* continue to env */
  } else {
    for (const cred of Object.values(secrets.providers)) {
      const key = cred.apiKey?.trim();
      if (key && key.length >= 8) values.push(key);
    }
  }
  for (const entry of secrets?.vault ?? []) {
    const v = entry.value?.trim();
    if (v && v.length >= 8) values.push(v);
  }
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || value.length < 8) continue;
    if (isForbiddenEnvKey(name)) values.push(value);
  }
  return [...new Set(values)];
}

/** Replace known secret substrings in stdout/stderr before returning to the model/UI. */
export function scrubSecretsFromText(
  text: string,
  secrets: string[],
): string {
  if (!text || !secrets.length) return text;
  let out = text;
  const sorted = [...secrets].sort((a, b) => b.length - a.length);
  for (const secret of sorted) {
    if (secret.length < 8) continue;
    out = out.split(secret).join("[REDACTED]");
  }
  return scrubSensitivePatterns(out);
}

/**
 * Best-effort redaction of common secret shapes that were typed into chat
 * or echoed by tools (API keys, password=… assignments).
 */
export function scrubSensitivePatterns(text: string): string {
  if (!text) return text;
  let out = text;
  const patterns: RegExp[] = [
    /\b(sk-[a-zA-Z0-9_-]{16,})\b/g,
    /\b(sk-or-[a-zA-Z0-9_-]{16,})\b/g,
    /\b(sk-ant-[a-zA-Z0-9_-]{16,})\b/g,
    /\b(xai-[a-zA-Z0-9_-]{16,})\b/g,
    /\b(gsk_[a-zA-Z0-9_-]{16,})\b/g,
    /\b(e2b_[a-zA-Z0-9_-]{16,})\b/g,
    /\b(ghp_[a-zA-Z0-9_]{20,})\b/g,
    /\b(AIza[0-9A-Za-z_-]{20,})\b/g,
    /\b(ak_[a-zA-Z0-9_-]{16,})\b/g,
    /((?:password|passwd|pwd|secret|token|api[_-]?key)\s*[=:]\s*)([^\s"'<>]{6,})/gi,
  ];
  for (const re of patterns) {
    out = out.replace(re, (match, g1, g2) => {
      if (typeof g2 === "string" && typeof g1 === "string") {
        return `${g1}[REDACTED]`;
      }
      return "[REDACTED]";
    });
  }
  return out;
}
