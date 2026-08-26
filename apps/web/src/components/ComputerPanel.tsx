import { useEffect, useState } from "react";
import { soraApi, type BrowserInstallStatus, type ComputerInfo } from "../api";

export default function ComputerPanel({
  agentSlug,
}: {
  agentSlug: string | null;
}) {
  const [info, setInfo] = useState<ComputerInfo | null>(null);
  const [browserStatus, setBrowserStatus] = useState<BrowserInstallStatus | null>(
    null,
  );
  const [url, setUrl] = useState("https://example.com");
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browserEnabled, setBrowserEnabled] = useState(true);
  const [sandboxEnabled, setSandboxEnabled] = useState(false);
  const [sandboxProvider, setSandboxProvider] = useState("e2b");
  const [sandboxMsg, setSandboxMsg] = useState<string | null>(null);

  async function refresh() {
    const [status] = await Promise.all([
      soraApi.browserStatus().catch(() => null),
    ]);
    setBrowserStatus(status);
    const config = await soraApi.getConfig().catch(() => null);
    if (config) {
      setBrowserEnabled(config.browser !== "off");
      setSandboxEnabled(Boolean(config.sandbox?.enabled));
      setSandboxProvider(config.sandbox?.provider ?? "e2b");
    }
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

  async function installBrowser() {
    setInstalling(true);
    setError(null);
    try {
      const result = await soraApi.browserInstall();
      if (!result.ok) {
        setError(result.error ?? "Install failed");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(false);
    }
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

  async function toggleSandbox() {
    setBusy(true);
    setError(null);
    setSandboxMsg(null);
    try {
      const next = !sandboxEnabled;
      await soraApi.setConfig({
        sandbox: {
          enabled: next,
          provider: next ? "e2b" : "local",
          failClosed: true,
          idleMs: 600_000,
        },
      });
      setSandboxEnabled(next);
      setSandboxProvider(next ? "e2b" : "local");
      setSandboxMsg(
        next
          ? "Cloud sandbox on — terminal runs in an E2B microVM. Add E2B key under Models. Host shell fallback is off."
          : "Sandbox off — terminal runs locally with a scrubbed env (no API keys).",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBrowser() {
    setBusy(true);
    setError(null);
    try {
      const next = browserEnabled ? "off" : "on";
      await soraApi.setConfig({ browser: next });
      setBrowserEnabled(next === "on");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const browser = info?.browser;
  const chromiumReady = browserStatus?.chromiumInstalled ?? false;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[13px] font-semibold text-ink">Computer</h2>
        <p className="mt-0.5 text-[12px] text-ink-3">
          Local Chromium per agent — free, no cloud VM required.
        </p>
      </div>

      <div className="rounded-card bg-surface p-3 shadow-card">
        <div className="flex items-center justify-between gap-2 text-[12px]">
          <span className="text-ink-2">Cloud sandbox</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              sandboxEnabled
                ? "bg-green-tint text-green"
                : "bg-field text-ink-3"
            }`}
          >
            {sandboxEnabled ? sandboxProvider : "local"}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-ink-3">
          Opt-in E2B microVM for shell + files. Smaller/cheaper than a full cloud
          desktop. Model API keys never enter the VM. See docs/sandbox-security.md.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleSandbox()}
          className="mt-2 rounded-control bg-field px-2.5 py-1 text-[12px] text-ink-2 hover:bg-hover disabled:opacity-50"
        >
          {sandboxEnabled ? "Disable sandbox" : "Enable E2B sandbox"}
        </button>
        {sandboxMsg && (
          <p className="mt-2 text-[11px] text-ink-3">{sandboxMsg}</p>
        )}
      </div>

      <div className="rounded-card bg-surface p-3 shadow-card">
        <div className="flex items-center justify-between gap-2 text-[12px]">
          <span className="text-ink-2">Browser</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              browser?.backend === "playwright" && chromiumReady
                ? "bg-green-tint text-green"
                : "bg-field text-ink-3"
            }`}
          >
            {browser?.backend ?? "…"}
            {browser?.open ? " · open" : ""}
          </span>
        </div>
        {browserStatus && (
          <p className="mt-2 text-[11px] text-ink-3">{browserStatus.message}</p>
        )}
        <p className="mt-2 truncate font-mono text-[11.5px] text-ink-3">
          {browser?.url || "about:blank"}
        </p>
        {info?.workspaceRoot && (
          <p className="mt-1 truncate font-mono text-[10.5px] text-ink-3">
            {info.workspaceRoot}
          </p>
        )}
        {browserEnabled && !chromiumReady && (
          <button
            type="button"
            disabled={installing}
            onClick={() => void installBrowser()}
            className="mt-2 rounded-control bg-ink px-3 py-1.5 text-[12px] font-medium text-surface disabled:opacity-50"
          >
            {installing ? "Installing Chromium…" : "Install Chromium"}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleBrowser()}
          className="mt-2 rounded-control bg-field px-2.5 py-1 text-[12px] text-ink-2 hover:bg-hover disabled:opacity-50"
        >
          {browserEnabled ? "Disable browser" : "Enable browser"}
        </button>
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
          disabled={busy || !chromiumReady}
          onClick={() => void openUrl()}
          className="rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface disabled:opacity-50"
        >
          Open
        </button>
        <button
          type="button"
          disabled={busy || !chromiumReady}
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
