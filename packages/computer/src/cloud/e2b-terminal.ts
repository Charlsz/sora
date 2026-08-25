import type { Terminal, TerminalOptions, TerminalResult } from "../types.ts";

const E2B_BASE = "https://api.e2b.dev";

/** Opt-in cloud terminal via E2B sandboxes (requires E2B_API_KEY). */
export class E2bTerminal implements Terminal {
  #apiKey: string;
  #sandboxId: string | null = null;

  constructor(apiKey: string) {
    this.#apiKey = apiKey;
  }

  async exec(
    command: string,
    options?: TerminalOptions,
  ): Promise<TerminalResult> {
    const sandboxId = await this.#ensureSandbox();
    const res = await fetch(`${E2B_BASE}/sandboxes/${sandboxId}/commands`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        command,
        cwd: options?.cwd,
        envs: options?.env,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        stdout: "",
        stderr: text,
        exitCode: 1,
        cwd: options?.cwd ?? "/",
      };
    }
    const body = (await res.json()) as {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
    };
    return {
      stdout: body.stdout ?? "",
      stderr: body.stderr ?? "",
      exitCode: body.exitCode ?? 0,
      cwd: options?.cwd ?? "/",
    };
  }

  async #ensureSandbox(): Promise<string> {
    if (this.#sandboxId) return this.#sandboxId;
    const res = await fetch(`${E2B_BASE}/sandboxes`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ template: "base" }),
    });
    if (!res.ok) {
      throw new Error(`E2B sandbox create failed (${res.status})`);
    }
    const body = (await res.json()) as { sandboxID?: string; id?: string };
    this.#sandboxId = body.sandboxID ?? body.id ?? null;
    if (!this.#sandboxId) {
      throw new Error("E2B sandbox create returned no id");
    }
    return this.#sandboxId;
  }

  async dispose(): Promise<void> {
    if (!this.#sandboxId) return;
    await fetch(`${E2B_BASE}/sandboxes/${this.#sandboxId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${this.#apiKey}` },
    }).catch(() => {});
    this.#sandboxId = null;
  }
}

export function resolveE2bApiKey(
  secrets?: { providers?: Record<string, { apiKey?: string }> },
): string | null {
  return (
    secrets?.providers?.e2b?.apiKey?.trim() ||
    process.env.E2B_API_KEY?.trim() ||
    null
  );
}
