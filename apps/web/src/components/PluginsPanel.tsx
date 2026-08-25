import { useEffect, useState } from "react";
import { soraApi, type PluginStatus } from "../api";

type BdStatus = Awaited<ReturnType<typeof soraApi.botdirectoryStatus>>;
type BdBot = Awaited<
  ReturnType<typeof soraApi.botdirectoryBots>
>["bots"][number];

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

  const [bd, setBd] = useState<BdStatus | null>(null);
  const [bdSignup, setBdSignup] = useState("");
  const [bdUser, setBdUser] = useState("");
  const [bdPass, setBdPass] = useState("");
  const [bdQuery, setBdQuery] = useState("");
  const [bdBots, setBdBots] = useState<BdBot[]>([]);

  async function refresh() {
    const data = await soraApi.plugins();
    setPlugins(data.plugins);
    const status = await soraApi.botdirectoryStatus();
    setBd(status);
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

  async function syncCatalog(full = false) {
    setBusy(full ? "bd:full" : "bd:sync");
    setError(null);
    try {
      const result = await soraApi.botdirectorySync(
        full ? { full: true } : { maxPages: 5 },
      );
      await refresh();
      setMessage(
        full
          ? `Mirrored ${result.total ?? 0} bots`
          : `Synced +${result.added ?? 0} · ${result.total ?? bd?.catalog.total ?? 0} total`,
      );
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function searchBd() {
    setBusy("bd:search");
    setError(null);
    try {
      const data = await soraApi.botdirectoryBots({
        q: bdQuery || undefined,
        limit: 12,
      });
      setBdBots(data.bots);
      setMessage(`Found ${data.bots.length} (${data.source})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function importBot(slug: string) {
    setBusy(`bd:import:${slug}`);
    setError(null);
    try {
      const result = await soraApi.botdirectoryImport({ slug });
      setMessage(`Imported agent “${result.agent.name}” (${result.agent.slug})`);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function signupBd() {
    const username = bdSignup.trim().toLowerCase();
    if (username.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    setBusy("bd:signup");
    setError(null);
    try {
      const result = await soraApi.botdirectorySignup(username);
      setBdSignup("");
      await refresh();
      setMessage(`Signed up @${result.username} — password stored locally`);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveBdCreds() {
    if (!bdPass.trim()) {
      setError("Paste your botdirectory password");
      return;
    }
    setBusy("bd:creds");
    setError(null);
    try {
      const result = await soraApi.botdirectoryCredentials({
        username: bdUser.trim() || undefined,
        password: bdPass.trim(),
      });
      setBdPass("");
      await refresh();
      setMessage(
        result.username
          ? `Write access linked as @${result.username}`
          : "Write password saved",
      );
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

      <section className="rounded-card bg-surface px-4 py-3 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-medium text-ink">Bot Directory</h3>
            <p className="mt-0.5 text-[12.5px] text-ink-2">
              Browse and import curated bots from{" "}
              <a
                href="https://botdirectory.ai"
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:underline"
              >
                botdirectory.ai
              </a>
              . Every Sora agent can search the catalog.
            </p>
          </div>
          <span className="shrink-0 rounded-control bg-inset px-2 py-0.5 text-[11px] font-medium text-ink">
            {bd?.writeConfigured
              ? bd.username
                ? `@${bd.username}`
                : "write ready"
              : "read-only"}
          </span>
        </div>
        <p className="mt-2 text-[11.5px] text-ink-3">
          Cached: {bd?.catalog.total ?? 0} bots
          {bd?.catalog.updatedAt
            ? ` · updated ${new Date(bd.catalog.updatedAt).toLocaleString()}`
            : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy === "bd:sync"}
            onClick={() => void syncCatalog(false)}
            className="rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface disabled:opacity-50"
          >
            {busy === "bd:sync" ? "Syncing…" : "Sync catalog"}
          </button>
          <button
            type="button"
            disabled={busy === "bd:full"}
            onClick={() => void syncCatalog(true)}
            className="rounded-control bg-hover-2 px-3 py-1.5 text-[12.5px] font-medium text-ink-2"
          >
            Full mirror
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={bdQuery}
            onChange={(e) => setBdQuery(e.target.value)}
            placeholder="Search bots…"
            className="h-9 flex-1 rounded-control border border-line bg-field px-3 text-[12.5px] text-ink outline-none focus:border-line-strong"
          />
          <button
            type="button"
            disabled={busy === "bd:search"}
            onClick={() => void searchBd()}
            className="rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface"
          >
            Search
          </button>
        </div>
        {bdBots.length > 0 && (
          <ul className="mt-3 flex max-h-56 flex-col gap-2 overflow-y-auto">
            {bdBots.map((bot) => (
              <li
                key={bot.slug}
                className="flex items-start justify-between gap-2 border-t border-line pt-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">
                    {bot.name}
                  </p>
                  <p className="text-[11.5px] text-ink-3">
                    {bot.category} · {bot.integrations.join(", ") || "—"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy === `bd:import:${bot.slug}`}
                  onClick={() => void importBot(bot.slug)}
                  className="shrink-0 rounded-control bg-hover-2 px-2 py-1 text-[11.5px] font-medium text-ink"
                >
                  Import
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-[12px] font-medium text-ink">Write access</p>
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            Sign up once (password saved locally) or paste an existing password.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={bdSignup}
              onChange={(e) => setBdSignup(e.target.value)}
              placeholder="new username"
              className="h-9 flex-1 rounded-control border border-line bg-field px-3 font-mono text-[12.5px] text-ink outline-none focus:border-line-strong"
            />
            <button
              type="button"
              disabled={busy === "bd:signup"}
              onClick={() => void signupBd()}
              className="rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface"
            >
              Sign up
            </button>
          </div>
          <div className="mt-2 flex flex-col gap-2">
            <input
              value={bdUser}
              onChange={(e) => setBdUser(e.target.value)}
              placeholder="username (optional)"
              className="h-9 w-full rounded-control border border-line bg-field px-3 font-mono text-[12.5px] text-ink outline-none focus:border-line-strong"
            />
            <input
              type="password"
              autoComplete="off"
              value={bdPass}
              onChange={(e) => setBdPass(e.target.value)}
              placeholder="write password"
              className="h-9 w-full rounded-control border border-line bg-field px-3 font-mono text-[12.5px] text-ink outline-none focus:border-line-strong"
            />
            <button
              type="button"
              disabled={busy === "bd:creds"}
              onClick={() => void saveBdCreds()}
              className="self-start rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface"
            >
              Save password
            </button>
          </div>
        </div>
      </section>

      {plugins
        .filter((p) => p.id !== "botdirectory")
        .map((plugin) => {
          const selectedApp = linkApp[plugin.id] ?? plugin.apps[0] ?? plugin.id;
          const needsKey = plugin.id === "github" || plugin.id === "composio";
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

              {needsKey && (
                <div className="mt-3 flex flex-col gap-2">
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder={
                      plugin.id === "github"
                        ? "GitHub PAT (ghp_…)"
                        : "Composio API key"
                    }
                    value={keys[plugin.id] ?? ""}
                    onChange={(e) =>
                      setKeys((prev) => ({
                        ...prev,
                        [plugin.id]: e.target.value,
                      }))
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
              )}

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
                    disabled={Boolean(
                      busy?.startsWith(`connect:${plugin.id}`),
                    )}
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

              {plugin.id === "mcp" && (
                <p className="mt-3 text-[12px] text-ink-3">
                  Add stdio/HTTP MCP servers via ~/.sora/mcp.json (API wiring
                  next). Tools hot-reload on plugin refresh.
                </p>
              )}
            </section>
          );
        })}
    </div>
  );
}
