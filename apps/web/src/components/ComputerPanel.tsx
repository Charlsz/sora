import { useEffect, useState } from "react";
import { soraApi } from "../api";

export type ComputerRunMode = "local" | "sandbox" | "off";

function modeFromProvider(provider?: string | null): ComputerRunMode {
  if (!provider || provider === "local" || provider === "host") return "local";
  if (provider === "e2b" || provider === "daytona" || provider === "docker")
    return "sandbox";
  return "sandbox";
}

export default function ComputerPanel({
  agentSlug,
  agentName,
  working = false,
  compact = false,
  fillWindow = false,
  onClose,
  onControlChange,
}: {
  agentSlug: string | null;
  agentName?: string | null;
  working?: boolean;
  /** Right-rail layout: screen card + Open overlay (reference chat UI). */
  compact?: boolean;
  /** When controlling, stretch the stream to fill available space. */
  fillWindow?: boolean;
  onClose?: () => void;
  onControlChange?: (streamUrl: string | null) => void;
}) {
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [computerReady, setComputerReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<ComputerRunMode>("sandbox");
  const [taskPath, setTaskPath] = useState<string | null>(null);
  const [controlUrl, setControlUrl] = useState<string | null>(null);

  async function ensureCloudComputer() {
    const providers = await soraApi.providers().catch(() => null);
    const e2b = providers?.providers.find((p) => p.id === "e2b");
    const hasKey = Boolean(e2b?.configured);
    setComputerReady(hasKey);

    const config = await soraApi.getConfig().catch(() => null);
    const provider = config?.computer?.provider ?? "e2b";
    const nextMode = modeFromProvider(provider);
    setMode(nextMode);

    if (!hasKey || nextMode !== "sandbox") return false;
    if (config?.computer?.preferDisplay === false) {
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

  useEffect(() => {
    void ensureCloudComputer().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [agentSlug]);

  useEffect(() => {
    setControlUrl(null);
    onControlChange?.(null);
  }, [agentSlug]);

  useEffect(() => {
    onControlChange?.(controlUrl);
  }, [controlUrl]);

  useEffect(() => {
    return () => {
      onControlChange?.(null);
    };
  }, [onControlChange]);

  useEffect(() => {
    if (mode !== "sandbox" || !agentSlug || !computerReady || controlUrl) {
      if (mode !== "sandbox" || !agentSlug || !computerReady) setShot(null);
      return;
    }
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
        const info = await soraApi.computer(agentSlug).catch(() => null);
        if (info?.files?.length) {
          setTaskPath(info.files[0] ?? null);
        } else {
          setTaskPath(null);
        }
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
  }, [mode, agentSlug, computerReady, controlUrl]);

  async function setRunMode(next: ComputerRunMode) {
    setMode(next);
    setError(null);
    setBusy(true);
    setControlUrl(null);
    try {
      if (next === "sandbox") {
        await soraApi.setConfig({
          computer: {
            provider: "e2b",
            preferDisplay: true,
            failClosed: true,
            idleMs: 600_000,
            commandTimeoutMs: 120_000,
          },
        });
        setComputerReady(
          Boolean(
            (await soraApi.providers().catch(() => null))?.providers.find(
              (p) => p.id === "e2b",
            )?.configured,
          ),
        );
      } else if (next === "local") {
        await soraApi.setConfig({
          computer: {
            provider: "local",
            preferDisplay: false,
            failClosed: false,
          },
        });
        setConnected(false);
        setShot(null);
      } else {
        await soraApi.setConfig({
          computer: {
            provider: "local",
            preferDisplay: false,
            failClosed: true,
          },
        });
        setConnected(false);
        setShot(null);
        setBooting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function openDesktop() {
    if (!agentSlug) return;
    if (mode !== "sandbox") {
      setError("Set Runs on → Sandbox first, then Open.");
      return;
    }
    setBusy(true);
    setError(null);
    setBooting(true);
    try {
      const ready = await ensureCloudComputer();
      if (!ready) {
        setError("Add an E2B key under Connected apps so the sandbox can start.");
        return;
      }
      await soraApi.computerDisplay(agentSlug).catch(() => null);
      const result = await soraApi.computerTakeover(agentSlug);
      if (!result.ok || !result.streamUrl) {
        setError(
          result.message ||
            result.error ||
            "Couldn’t open the desktop. Check the E2B key and try again.",
        );
        return;
      }
      setConnected(true);
      setControlUrl(result.streamUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setBooting(false);
    }
  }

  if (!agentSlug) {
    return (
      <p className="text-[13px] text-ink-3">
        Pick a teammate to see their computer.
      </p>
    );
  }

  const name = agentName ?? "Teammate";
  const canOpen = mode === "sandbox" && computerReady && !controlUrl;
  const runsOn: Array<{ id: ComputerRunMode; label: string }> = [
    { id: "local", label: "This PC" },
    { id: "sandbox", label: "Sandbox" },
    { id: "off", label: "Off" },
  ];

  const screenInner =
    mode === "off" ? (
      <p className="px-4 text-center text-[13px] text-ink-3">Computer is off</p>
    ) : mode === "local" ? (
      <p className="px-4 text-center text-[13px] text-ink-3">Running on this PC</p>
    ) : controlUrl ? (
      <iframe
        title={`${name} desktop`}
        src={controlUrl}
        className="h-full w-full border-0 bg-black"
        allow="clipboard-read; clipboard-write; fullscreen"
        referrerPolicy="no-referrer"
      />
    ) : shot ? (
      <img
        src={`data:image/png;base64,${shot}`}
        alt="Live desktop"
        className="h-full w-full object-cover object-top"
      />
    ) : (
      <p className="px-4 text-center text-[13px] text-ink-3">
        {booting
          ? "starting…"
          : computerReady
            ? "live desktop"
            : "needs E2B key"}
      </p>
    );

  if (compact) {
    return (
      <div
        className={`flex min-h-0 flex-col gap-2 ${
          fillWindow ? "h-full flex-1" : ""
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-0.5">
          <p className="truncate text-[13px] font-medium text-ink">
            {name}&apos;s screen
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {!controlUrl && connected && mode === "sandbox" && (
              <span className="text-[11px] font-medium text-ink-3">Watch</span>
            )}
            {controlUrl && (
              <button
                type="button"
                onClick={() => setControlUrl(null)}
                className="text-[12px] font-medium text-ink-3"
              >
                Exit
              </button>
            )}
          </div>
        </div>

        <div
          className={`relative flex w-full items-center justify-center overflow-hidden rounded-[12px] border border-line bg-inset ${
            fillWindow && controlUrl
              ? "min-h-0 flex-1"
              : "aspect-[16/10]"
          } ${mode === "off" ? "opacity-50" : ""}`}
        >
          {screenInner}

          {canOpen && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void openDesktop()}
              className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-surface/95 px-3.5 py-1.5 text-[13px] font-medium text-ink shadow-raised backdrop-blur-sm disabled:opacity-50"
            >
              {busy ? "Opening…" : "Open"}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M7 17L17 7M7 7h10v10" />
              </svg>
            </button>
          )}
        </div>

        {!controlUrl && (
          <div className="flex shrink-0 overflow-hidden rounded-[8px] border border-line">
            {runsOn.map((opt, i) => (
              <button
                key={opt.id}
                type="button"
                disabled={busy}
                onClick={() => void setRunMode(opt.id)}
                className={`flex-1 py-1 text-[11px] font-medium disabled:opacity-50 ${
                  i > 0 ? "border-l border-line" : ""
                } ${
                  mode === opt.id
                    ? "bg-field text-ink"
                    : "text-ink-3"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="rounded-control bg-red-tint px-2.5 py-1.5 text-[11.5px] text-red">
            {error}
          </p>
        )}
      </div>
    );
  }

  const statusLabel =
    mode === "off"
      ? "Off"
      : mode === "local"
        ? "This PC"
        : !computerReady
          ? "Needs setup"
          : controlUrl
            ? "In control"
            : connected
              ? "Connected"
              : booting
                ? "Starting…"
                : "Ready";

  const statusDot =
    mode === "off"
      ? "bg-ink-3"
      : controlUrl || connected
        ? "bg-green"
        : booting
          ? "bg-accent animate-pulse"
          : "bg-ink-3";

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-semibold tracking-[0.1em] text-ink-3">
            COMPUTER
          </p>
          <p className="mt-1 text-[15px] font-semibold text-ink">
            {name}&apos;s computer
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="Close computer"
            onClick={onClose}
            className="rounded-control px-2 py-1 text-[13px] text-ink-3"
          >
            ✕
          </button>
        )}
      </div>

      {mode === "sandbox" && !computerReady ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-ink-2">
            Add an E2B key under Connections so {name} gets a cloud sandbox.
          </p>
        </div>
      ) : (
        <>
          <div
            className={`relative flex w-full items-center justify-center overflow-hidden rounded-[10px] border border-line bg-inset ${
              controlUrl ? "aspect-[4/3] min-h-[220px]" : "aspect-[16/10]"
            } ${mode === "off" ? "opacity-50" : ""}`}
          >
            {screenInner}
            {canOpen && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void openDesktop()}
                className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-surface/95 px-3.5 py-1.5 text-[13px] font-medium text-ink shadow-raised backdrop-blur-sm disabled:opacity-50"
              >
                {busy ? "Opening…" : "Open"}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M7 17L17 7M7 7h10v10" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className={`size-1.5 rounded-full ${statusDot}`} />
            <span className="text-[13px] font-medium text-ink">{statusLabel}</span>
          </div>

          {controlUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setControlUrl(null)}
              className="w-full rounded-control border border-line bg-field px-3 py-2 text-[13px] font-medium text-ink disabled:opacity-50"
            >
              Exit control
            </button>
          )}

          {working && taskPath && mode !== "off" && (
            <div>
              <p className="text-[12px] font-medium text-ink-3">Folder</p>
              <p className="mt-0.5 truncate font-mono text-[12px] text-ink-2">
                {taskPath}
              </p>
            </div>
          )}
        </>
      )}

      <div>
        <p className="text-[12px] font-semibold tracking-[0.08em] text-ink-3">
          RUNS ON
        </p>
        <div className="mt-2 flex overflow-hidden rounded-[10px] border border-line">
          {runsOn.map((opt, i) => (
            <button
              key={opt.id}
              type="button"
              disabled={busy}
              onClick={() => void setRunMode(opt.id)}
              className={`flex-1 py-1.5 text-[12.5px] font-medium disabled:opacity-50 ${
                i > 0 ? "border-l border-line" : ""
              } ${
                mode === opt.id
                  ? "bg-field text-ink"
                  : "text-ink-3"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-control bg-red-tint px-3 py-2 text-[12px] text-red">
          {error}
        </p>
      )}
    </div>
  );
}
