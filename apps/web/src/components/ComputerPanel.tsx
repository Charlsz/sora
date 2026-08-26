import { useEffect, useState } from "react";
import { openExternalUrl } from "../openExternal";
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
  onClose,
}: {
  agentSlug: string | null;
  agentName?: string | null;
  /** When true, show the current folder/path the bot is in. */
  working?: boolean;
  onClose?: () => void;
}) {
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [computerReady, setComputerReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<ComputerRunMode>("sandbox");
  const [taskPath, setTaskPath] = useState<string | null>(null);

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
    if (mode !== "sandbox" || !agentSlug || !computerReady) {
      setShot(null);
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
  }, [mode, agentSlug, computerReady]);

  async function setRunMode(next: ComputerRunMode) {
    setMode(next);
    setError(null);
    setBusy(true);
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
      setError("Set Runs on → Sandbox first, then Take control.");
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
      // Warm the desktop stream (screenshot poll) before takeover.
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
      await openExternalUrl(result.streamUrl);
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
  const statusLabel =
    mode === "off"
      ? "Off"
      : mode === "local"
        ? "This PC"
        : !computerReady
          ? "Needs setup"
          : connected
            ? "Connected"
            : booting
              ? "Starting…"
              : "Ready";

  const statusDot =
    mode === "off"
      ? "bg-ink-3"
      : connected
        ? "bg-green"
        : booting
          ? "bg-accent animate-pulse"
          : "bg-ink-3";

  const runsOn: Array<{ id: ComputerRunMode; label: string }> = [
    { id: "local", label: "This PC" },
    { id: "sandbox", label: "Sandbox" },
    { id: "off", label: "Off" },
  ];

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
            className="rounded-control px-2 py-1 text-[13px] text-ink-3 hover:bg-hover hover:text-ink"
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
          <div
            className={`relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-[10px] border border-line bg-inset ${
              mode === "off" ? "opacity-50" : ""
            }`}
          >
            {mode === "off" ? (
              <p className="px-4 text-center text-[13px] text-ink-3">
                Computer is off
              </p>
            ) : mode === "local" ? (
              <p className="px-4 text-center text-[13px] text-ink-3">
                Running on this PC
              </p>
            ) : shot ? (
              <img
                src={`data:image/png;base64,${shot}`}
                alt="Live desktop"
                className="h-full w-full object-contain object-top"
              />
            ) : (
              <p className="px-4 text-center text-[13px] text-ink-3">
                {booting ? "starting desktop…" : "live desktop"}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className={`size-1.5 rounded-full ${statusDot}`} />
            <span className="text-[13px] font-medium text-ink">{statusLabel}</span>
          </div>

          {mode === "sandbox" && computerReady && (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void openDesktop()}
                className="w-full rounded-control bg-ink px-3 py-2 text-[13px] font-medium text-surface disabled:opacity-50"
              >
                {busy ? "Opening…" : "Take control"}
              </button>
              <p className="text-[11.5px] leading-snug text-ink-3">
                Preview above is watch-only. Take control opens a full window
                where you can use mouse and keyboard.
              </p>
            </div>
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
                  : "text-ink-3 hover:bg-hover hover:text-ink-2"
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
