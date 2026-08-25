import { useEffect, useState } from "react";
import { soraApi, type PluginStatus } from "../api";

export default function PluginsPanel({
  onChanged,
}: {
  onChanged?: () => void;
}) {
  const [plugins, setPlugins] = useState<PluginStatus[]>([]);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkApp, setLinkApp] = useState<Record<string, string>>({});

  async function refresh() {
    const data = await soraApi.plugins();
    setPlugins(data.plugins);
  }

  useEffect(() => {
    refresh().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, []);

  async function saveKey(id: string) {
    const apiKey = keys[id]?.trim();
    if (!apiKey) {
      setError("Paste a key first");
      return;
    }
    setBusy(id);
    setError(null);
    setMessage(null);
    try {
      await soraApi.setProvider(id, { apiKey });
      setKeys((prev) => ({ ...prev, [id]: "" }));
      await refresh();
      setMessage(`${id} key saved locally`);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function clearKey(id: string) {
    setBusy(`clear:${id}`);
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

  async function connect(id: string, app: string) {
    setBusy(`connect:${id}:${app}`);
    setError(null);
    setMessage(null);
    try {
      const result = await soraApi.connectPlugin(id, app);
      setMessage(result.message);
      if (result.redirectUrl) {
        window.open(result.redirectUrl, "_blank", "noopener,noreferrer");
      }
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Plugins</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          Link trusted tools. Keys stay in ~/.sora/secrets.json — never sent
          over SSE or logs.
        </p>
      </div>

      {error && (
        <p className="rounded-control bg-red-tint px-3 py-2 text-[13px] text-red">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-control bg-inset px-3 py-2 text-[13px] text-ink-2">
          {message}
        </p>
      )}

      {plugins.map((plugin) => {
        const selectedApp = linkApp[plugin.id] ?? plugin.apps[0] ?? plugin.id;
        return (
          <section
            key={plugin.id}
            className="rounded-card bg-surface px-4 py-3 shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[14px] font-medium text-ink">
                  {plugin.name}
                </h3>
                <p className="mt-0.5 text-[12.5px] text-ink-2">
                  {plugin.description}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-control px-2 py-0.5 text-[11px] font-medium ${
                  plugin.configured
                    ? "bg-inset text-ink"
                    : "bg-field text-ink-3"
                }`}
              >
                {plugin.configured ? plugin.hint ?? "linked" : "not linked"}
              </span>
            </div>

            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
              {plugin.privacy}
            </p>

            <div className="mt-3 flex flex-col gap-2">
              <input
                type="password"
                autoComplete="off"
                placeholder={
                  plugin.id === "github"
                    ? "GitHub PAT (ghp_…)"
                    : plugin.id === "composio"
                      ? "Composio API key"
                      : "API key"
                }
                value={keys[plugin.id] ?? ""}
                onChange={(e) =>
                  setKeys((prev) => ({ ...prev, [plugin.id]: e.target.value }))
                }
                className="h-9 w-full rounded-control border border-line bg-field px-3 font-mono text-[12.5px] text-ink outline-none focus:border-line-strong"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy === plugin.id}
                  onClick={() => void saveKey(plugin.id)}
                  className="rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface disabled:opacity-50"
                >
                  {busy === plugin.id ? "Saving…" : "Save key"}
                </button>
                {plugin.configured && (
                  <button
                    type="button"
                    disabled={busy === `clear:${plugin.id}`}
                    onClick={() => void clearKey(plugin.id)}
                    className="rounded-control bg-hover-2 px-3 py-1.5 text-[12.5px] font-medium text-ink-2"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {plugin.id === "composio" && plugin.configured && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <select
                  value={selectedApp}
                  onChange={(e) =>
                    setLinkApp((prev) => ({
                      ...prev,
                      [plugin.id]: e.target.value,
                    }))
                  }
                  className="h-8 rounded-control border border-line bg-field px-2 text-[12.5px] text-ink"
                >
                  {plugin.apps.map((app) => (
                    <option key={app} value={app}>
                      {app}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={Boolean(busy?.startsWith(`connect:${plugin.id}`))}
                  onClick={() => void connect(plugin.id, selectedApp)}
                  className="rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface"
                >
                  Link account
                </button>
              </div>
            )}

            {plugin.id === "github" && (
              <button
                type="button"
                className="mt-3 text-[12px] text-ink-2 underline-offset-2 hover:underline"
                onClick={() =>
                  window.open(
                    "https://github.com/settings/tokens",
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                Create a GitHub token →
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
