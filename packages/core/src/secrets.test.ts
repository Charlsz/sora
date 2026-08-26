import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decryptSecrets,
  encryptSecrets,
  loadSecrets,
  saveSecrets,
  type SoraSecrets,
} from "./secrets.ts";

describe("secrets encryption", () => {
  const dirs: string[] = [];

  afterEach(() => {
    delete process.env.SORA_ENCRYPTION_KEY;
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("round-trip encrypt/decrypt", () => {
    const secrets: SoraSecrets = {
      version: 1,
      providers: { openai: { apiKey: "sk-test-secret" } },
      updatedAt: new Date().toISOString(),
    };
    const file = encryptSecrets(secrets, "passphrase-one");
    expect(file.version).toBe(2);
    const back = decryptSecrets(file, "passphrase-one");
    expect(back.providers.openai?.apiKey).toBe("sk-test-secret");
  });

  test("saveSecrets encrypts when SORA_ENCRYPTION_KEY is set", () => {
    process.env.SORA_ENCRYPTION_KEY = "unit-test-key";
    const dir = mkdtempSync(join(tmpdir(), "sora-sec-"));
    dirs.push(dir);
    const path = join(dir, "secrets.json");
    saveSecrets(path, {
      version: 1,
      providers: { openrouter: { apiKey: "or-secret" } },
      updatedAt: new Date().toISOString(),
    });
    const raw = JSON.parse(readFileSync(path, "utf8")) as { version: number };
    expect(raw.version).toBe(2);
    const loaded = loadSecrets(path);
    expect(loaded.providers.openrouter?.apiKey).toBe("or-secret");
  });

  test("plaintext secrets still load without key", () => {
    const dir = mkdtempSync(join(tmpdir(), "sora-sec-"));
    dirs.push(dir);
    const path = join(dir, "secrets.json");
    delete process.env.SORA_ENCRYPTION_KEY;
    writeFileSync(
      path,
      JSON.stringify(
        {
          version: 1,
          providers: { ollama: { baseUrl: "http://127.0.0.1:11434/v1" } },
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    const loaded = loadSecrets(path);
    expect(loaded.providers.ollama?.baseUrl).toContain("11434");
  });
});
