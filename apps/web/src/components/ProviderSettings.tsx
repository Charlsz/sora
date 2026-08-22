import { useEffect, useState } from "react";
import {
  soraApi,
  type ProviderInfo,
} from "../api";

export default function ProviderSettings({
  onClose,
  onChanged,
}: {
  onClose?: () => void;
  onChanged?: () => void;
}) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [defaultModel, setDefaultModel] = useState("mock:echo");
  const [draftModel, setDraftModel] = useState("mock:echo");
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const data = await soraApi.providers();
    setProviders(data.providers);
    setDefaultModel(data.defaultModel);
    setDraftModel(data.defaultModel);
  }

  useEffect(() => {
    refresh().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, []);

  async function saveProvider(id: string) {
    setBusy(id);
    setError(null);
    setMessage(null);
    try {
      await soraApi.setProvider(id, { apiKey: keys[id] || undefined });
      setKeys((prev) => ({ ...prev, [id]: "" }));
      await refresh();
      setMessage(`${id} connected`);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function clearProvider(id: string) {
    setBusy(id);
    setError(null);
    try {
      await soraApi.clearProvider(id);
      await refresh();
      setMessage(`${id} cleared`);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveDefault() {
    setBusy("default");
    setError(null);
    try {
      await soraApi.setConfig({ defaultModel: draftModel.trim() });
      await refresh();
      setMessage(`Default model → ${draftModel.trim()}`);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function testModel() {
    setBusy("test");
    setError(null);
    setMessage(null);
    try {
      const result = await soraApi.testProvider(draftModel.trim() || defaultModel);
      if (result.ok) {
        setMessage(`Test ok · ${result.model}: ${result.reply?.slice(0, 80)}`);
      } else {
        setError(result.error ?? "Test failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full max-w-lg flex-col">
      <div className="flex items-center justify-between border-b border-line px-1 pb-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Models & keys</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            Bring your own LLM — keys stay in ~/.sora/secrets.json
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-control px-2 py-1 text-[12.5px] text-ink-2 hover:bg-hover"
          >
            Close
          </button>
        )}
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        <section className="rounded-card bg-surface p-3 shadow-card">
          <label className="text-[12px] font-medium text-ink-2">
            Default model
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              value={draftModel}
              onChange={(e) => setDraftModel(e.target.value)}
              placeholder="openrouter:openai/gpt-4o-mini"
              className="min-w-0 flex-1 rounded-control border border-line bg-field px-2.5 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-line-strong"
            />
            <button
              type="button"
              disabled={busy === "default"}
              onClick={() => void saveDefault()}
              className="rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              disabled={busy === "test"}
              onClick={() => void testModel()}
              className="rounded-control bg-field px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-hover disabled:opacity-50"
            >
              Test
            </button>
          </div>
          <p className="mt-2 text-[11.5px] text-ink-3">
            Examples: <code className="font-mono">mock:echo</code>,{" "}
            <code className="font-mono">ollama:llama3.2</code>,{" "}
            <code className="font-mono">openai:gpt-4o-mini</code>,{" "}
            <code className="font-mono">openrouter:anthropic/claude-sonnet-4</code>
          </p>
        </section>

        {providers
          .filter((p) => p.id !== "mock")
          .map((p) => (
            <section
              key={p.id}
              className="rounded-card bg-surface p-3 shadow-card"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[13.5px] font-medium text-ink">
                    {p.name}
                  </div>
                  <div className="text-[12px] text-ink-3">{p.description}</div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    p.configured
                      ? "bg-green-tint text-green"
                      : "bg-field text-ink-3"
                  }`}
                >
                  {p.configured
                    ? p.fromEnv
                      ? "env"
                      : p.hint ?? "connected"
                    : "needed"}
                </span>
              </div>

              {p.needsKey && (
                <div className="mt-2.5 flex gap-2">
                  <input
                    type="password"
                    autoComplete="off"
                    value={keys[p.id] ?? ""}
                    onChange={(e) =>
                      setKeys((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    placeholder={
                      p.configured ? "•••••••• (paste to replace)" : "API key"
                    }
                    className="min-w-0 flex-1 rounded-control border border-line bg-field px-2.5 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-line-strong"
                  />
                  <button
                    type="button"
                    disabled={busy === p.id || !(keys[p.id] ?? "").trim()}
                    onClick={() => void saveProvider(p.id)}
                    className="rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface disabled:opacity-40"
                  >
                    Save
                  </button>
                  {p.configured && !p.fromEnv && (
                    <button
                      type="button"
                      disabled={busy === p.id}
                      onClick={() => void clearProvider(p.id)}
                      className="rounded-control px-2 py-1.5 text-[12.5px] text-ink-3 hover:bg-hover hover:text-ink"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              {!p.needsKey && (
                <p className="mt-2 font-mono text-[11.5px] text-ink-3">
                  {p.baseUrl || "local"}
                </p>
              )}
            </section>
          ))}
      </div>

      {(message || error) && (
        <p
          className={`mt-3 rounded-control px-3 py-2 text-[12.5px] ${
            error ? "bg-red-tint text-red" : "bg-green-tint text-green"
          }`}
        >
          {error ?? message}
        </p>
      )}
    </div>
  );
}
