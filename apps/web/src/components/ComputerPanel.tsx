import { useEffect, useState } from "react";
import { soraApi, type ComputerInfo } from "../api";

export default function ComputerPanel({
  agentSlug,
}: {
  agentSlug: string | null;
}) {
  const [info, setInfo] = useState<ComputerInfo | null>(null);
  const [url, setUrl] = useState("https://example.com");
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!agentSlug) {
      setInfo(null);
      return;
    }
    const data = await soraApi.computer(agentSlug);
    setInfo(data);
  }

  useEffect(() => {
    refresh().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [agentSlug]);

  if (!agentSlug) {
    return (
      <p className="text-[13px] text-ink-3">Select an agent to view its computer.</p>
    );
  }

  async function openUrl() {
    setBusy(true);
    setError(null);
    try {
      await soraApi.browserNavigate(agentSlug, url.trim());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function takeShot() {
    setBusy(true);
    setError(null);
    try {
      const result = await soraApi.browserScreenshot(agentSlug);
      if (result.base64) setShot(result.base64);
      else setError(result.message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const browser = info?.browser;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[13px] font-semibold text-ink">Computer</h2>
        <p className="mt-0.5 text-[12px] text-ink-3">
          Local Chromium per agent — free, no Box/CUA required.
        </p>
      </div>

      <div className="rounded-card bg-surface p-3 shadow-card">
        <div className="flex items-center justify-between gap-2 text-[12px]">
          <span className="text-ink-2">Browser</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              browser?.backend === "playwright"
                ? "bg-green-tint text-green"
                : "bg-field text-ink-3"
            }`}
          >
            {browser?.backend ?? "…"}
            {browser?.open ? " · open" : ""}
          </span>
        </div>
        <p className="mt-2 truncate font-mono text-[11.5px] text-ink-3">
          {browser?.url || "about:blank"}
        </p>
        {info?.workspaceRoot && (
          <p className="mt-1 truncate font-mono text-[10.5px] text-ink-3">
            {info.workspaceRoot}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-0 flex-1 rounded-control border border-line bg-field px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-line-strong"
          placeholder="https://"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void openUrl()}
          className="rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface disabled:opacity-50"
        >
          Open
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void takeShot()}
          className="rounded-control bg-field px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-hover disabled:opacity-50"
        >
          Shot
        </button>
      </div>

      {shot && (
        <div className="overflow-hidden rounded-card border border-line bg-inset">
          <img
            src={`data:image/png;base64,${shot}`}
            alt="Browser screenshot"
            className="w-full"
          />
        </div>
      )}

      {error && (
        <p className="rounded-control bg-red-tint px-3 py-2 text-[12px] text-red">
          {error}
        </p>
      )}
    </div>
  );
}
