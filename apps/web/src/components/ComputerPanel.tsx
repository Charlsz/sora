import { useEffect, useState } from "react";
import { soraApi, type ComputerInfo } from "../api";
import type { ToolRow } from "./ToolChips";

function friendlyAction(raw: string): string {
  const n = raw.toLowerCase();
  if (n.includes("list") || n.includes("read")) return "Workspace inspected";
  if (n.includes("write") || n.includes("edit")) return "File written";
  if (n.includes("terminal") || n.includes("shell")) return "Terminal ran";
  if (n.includes("browser") || n.includes("navigate")) return "Browser used";
  if (n.includes("screenshot")) return "Screenshot taken";
  return raw.replace(/[_.:]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ComputerPanel({
  agentSlug,
  agentName,
  activityRows = [],
  connectedHint,
}: {
  agentSlug: string | null;
  agentName?: string | null;
  activityRows?: ToolRow[];
  connectedHint?: boolean;
}) {
  const [info, setInfo] = useState<ComputerInfo | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [shot, setShot] = useState<string | null>(null);
  const [watching, setWatching] = useState(true);
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [computerReady, setComputerReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  function pushLog(entry: string) {
    setLog((prev) => {
      if (prev[prev.length - 1] === entry) return prev;
      return [...prev.slice(-8), entry];
    });
  }

  async function ensureCloudComputer() {
    const providers = await soraApi.providers().catch(() => null);
    const e2b = providers?.providers.find((p) => p.id === "e2b");
    const hasKey = Boolean(e2b?.configured);
    setComputerReady(hasKey);
    if (!hasKey) return false;

    const config = await soraApi.getConfig().catch(() => null);
    const provider = config?.computer?.provider ?? "local";
    const preferDisplay = config?.computer?.preferDisplay !== false;
    if (provider !== "e2b" || !preferDisplay) {
      await soraApi.setConfig({
        computer: {
          provider: "e2b",
          preferDisplay: true,
          failClosed: true,
          idleMs: 600_000,
          commandTimeoutMs: 120_000,
        },
      });
    }
    return true;
  }

  async function refresh() {
    const ok = await ensureCloudComputer();
    if (!agentSlug) {
      setInfo(null);
      setFiles([]);
      return;
    }
    const data = await soraApi.computer(agentSlug);
    setInfo(data);
    setFiles(data.files ?? []);
    if (ok) pushLog("Connected");
  }

  useEffect(() => {
    refresh().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [agentSlug]);

  useEffect(() => {
    if (connectedHint) {
      setConnected(true);
      pushLog("Connected");
    }
  }, [connectedHint]);

  useEffect(() => {
    for (const row of activityRows) {
      if (row.status === "completed" || row.status === "failed") {
        pushLog(friendlyAction(row.label));
      }
    }
  }, [activityRows]);

  useEffect(() => {
    if (!watching || !agentSlug || !computerReady) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const result = await soraApi.computerDisplay(agentSlug);
        if (cancelled) return;
        if (result.frame?.base64) {
          setShot(result.frame.base64);
          setConnected(true);
          setBooting(false);
        }
        if (result.frame?.streamUrl) setConnected(true);
      } catch (err) {
        if (!cancelled) {
          setBooting(true);
          const msg = err instanceof Error ? err.message : String(err);
          if (msg && !/bad request/i.test(msg)) setError(msg);
        }
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [watching, agentSlug, computerReady]);

  if (!agentSlug) {
    return (
      <p className="text-[13px] text-ink-3">
        Pick a teammate to see their computer.
      </p>
    );
  }

  async function openDesktop() {
    setBusy(true);
    setError(null);
    setBooting(true);
    try {
      await ensureCloudComputer();
      const result = await soraApi.computerTakeover(agentSlug);
      if (!result.ok || !result.streamUrl) {
        setError(result.message || "Couldn’t open the desktop.");
        return;
      }
      setConnected(true);
      pushLog("Desktop opened");
      window.open(result.streamUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setBooting(false);
    }
  }

  async function startWatch() {
    setWatching(true);
    setBusy(true);
    setError(null);
    setBooting(true);
    try {
      await ensureCloudComputer();
      const result = await soraApi.computerDisplay(agentSlug);
      if (result.frame?.base64) {
        setShot(result.frame.base64);
        setConnected(true);
        pushLog("Watching desktop");
      } else {
        setError("Desktop is starting — try again in a few seconds.");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setBooting(false);
    }
  }

  const statusLabel = !computerReady
    ? "Needs setup"
    : connected
      ? "Connected"
      : booting
        ? "Starting…"
        : "Ready";

  const statusDot = connected
    ? "bg-green"
    : booting
      ? "bg-accent animate-pulse"
      : "bg-ink-3";

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      {/* Header — matches sketch */}
      <div>
        <p className="text-[13px] font-semibold tracking-[0.08em] text-ink">
          COMPUTER
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className={`size-1.5 rounded-full ${statusDot}`} />
          <span className="text-[13px] font-medium text-ink">{statusLabel}</span>
        </div>
        <p className="mt-1 text-[12.5px] text-ink-3">
          {computerReady ? "Linux · Sandbox" : "Cloud sandbox required"}
        </p>
      </div>

      {!computerReady ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-ink-2">
            Add an E2B key under Connections so {agentName ?? "this teammate"}{" "}
            gets a cloud computer.
          </p>
          <a
            href="https://e2b.dev/docs/api-key"
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-ink-3 underline hover:text-ink-2"
          >
            Get a sandbox key
          </a>
        </div>
      ) : (
        <>
          {/* Live desktop preview */}
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div
              className={`relative flex min-h-[180px] flex-1 items-center justify-center overflow-hidden rounded-[4px] border border-dashed ${
                shot ? "border-line bg-inset" : "border-line-strong bg-transparent"
              }`}
            >
              {shot ? (
                <img
                  src={`data:image/png;base64,${shot}`}
                  alt="Live desktop preview"
                  className="h-full w-full object-contain object-top"
                />
              ) : (
                <p className="px-4 text-center text-[13px] text-ink-3">
                  {booting ? "starting desktop…" : "live desktop preview"}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (watching && shot) setWatching(false);
                  else void startWatch();
                }}
                className={`rounded-control px-3 py-1.5 text-[12px] font-medium ${
                  watching && shot
                    ? "bg-green-tint text-green"
                    : "bg-field text-ink-2 hover:bg-hover"
                } disabled:opacity-50`}
              >
                {watching && shot ? "Watching" : "Watch"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void openDesktop()}
                className="rounded-control bg-ink px-3 py-1.5 text-[12px] font-medium text-surface disabled:opacity-50"
              >
                Open
              </button>
            </div>
          </div>

          {/* Files */}
          <section>
            <p className="text-[13px] font-medium text-ink">Files</p>
            <div className="mt-1.5 font-mono text-[12px] leading-relaxed text-ink-2">
              <p>/workspace</p>
              {files.length === 0 ? (
                <p className="text-ink-3">└ empty</p>
              ) : (
                files.slice(0, 12).map((name, i) => (
                  <p key={name} className="truncate text-ink-2">
                    {i === files.length - 1 || i === 11 ? "└" : "├"} {name}
                  </p>
                ))
              )}
            </div>
          </section>

          {/* Activity */}
          <section>
            <p className="text-[13px] font-medium text-ink">Activity</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {(log.length ? log : ["Waiting for work"]).map((entry, i) => (
                <li
                  key={`${entry}-${i}`}
                  className="flex items-center gap-2 text-[12.5px] text-ink-2"
                >
                  <span className="size-1 shrink-0 rounded-full bg-ink" />
                  {entry}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {error && (
        <p className="rounded-control bg-red-tint px-3 py-2 text-[12px] text-red">
          {error}
        </p>
      )}
    </div>
  );
}
