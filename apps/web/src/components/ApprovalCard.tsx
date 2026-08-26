import { useState } from "react";
import type { PendingPermission } from "../api";

type ApprovalCardProps = {
  request: PendingPermission;
  onRespond: (
    decision: "allow" | "deny",
    options?: { rememberSession?: boolean },
  ) => void | Promise<void>;
};

const ACTION_LABELS: Record<string, string> = {
  "fs.write": "Write a file",
  "fs.delete": "Delete a file",
  "terminal.exec": "Run a command",
  "http.request": "Contact a website",
  "browser.navigate": "Open a web page",
  "browser.click": "Click in the browser",
  "browser.type": "Type in the browser",
  "browser.screenshot": "Take a screenshot",
  "browser.close": "Close the browser",
  "agent.delegate": "Ask a teammate for help",
};

export default function ApprovalCard({ request, onRespond }: ApprovalCardProps) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<"allow" | "deny" | null>(null);

  const respond = async (
    decision: "allow" | "deny",
    options?: { rememberSession?: boolean },
  ) => {
    if (busy || sent) return;
    setBusy(true);
    try {
      await onRespond(decision, options);
      setSent(decision);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div
        className="flex w-full max-w-80 items-center gap-3"
        style={{
          animation: "pop-in 260ms cubic-bezier(0.23,1,0.32,1) both",
        }}
      >
        <span
          className={`inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-[12.5px] font-medium ${
            sent === "allow"
              ? "bg-green-tint text-green"
              : "bg-red-tint text-red"
          }`}
        >
          <span
            className={`flex size-4.5 items-center justify-center rounded-full text-white ${
              sent === "allow" ? "bg-green" : "bg-red"
            }`}
          >
            {sent === "allow" ? (
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            )}
          </span>
          {sent === "allow" ? "Allowed" : "Denied"}
        </span>
      </div>
    );
  }

  const title = ACTION_LABELS[request.action] ?? request.action;

  return (
    <div className="flex w-full max-w-80 flex-col items-stretch">
      <div className="w-full self-start overflow-hidden rounded-card bg-surface shadow-card">
        <div
          className="primitive-card-pad"
          style={{
            animation: "fade-up 350ms cubic-bezier(0.23,1,0.32,1) both",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">
                Permission required
              </p>
              <span className="mt-1 block text-[13px] font-medium text-ink">
                {title}
              </span>
            </div>
            <span className="shrink-0 rounded-full bg-field px-2 py-0.5 font-mono text-[10.5px] text-ink-2">
              {request.agentSlug}
            </span>
          </div>
          <p className="mt-2 break-all font-mono text-[12px] leading-relaxed text-ink-2">
            {request.resource}
          </p>
        </div>

        <div className="primitive-card-footer flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void respond("deny")}
            className="rounded-control px-3 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors duration-100 hover:bg-hover disabled:opacity-50"
          >
            Deny
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void respond("allow")}
            className="rounded-control bg-field px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-hover disabled:opacity-50"
          >
            Allow once
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void respond("allow", { rememberSession: true })}
            className="rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface transition-[transform,opacity] duration-150 enabled:active:scale-[0.97] disabled:opacity-50"
          >
            Allow session
          </button>
        </div>
      </div>
    </div>
  );
}
