import type { Workflow } from "../api";

/** Short human label for common 5-field cron expressions. */
export function formatCronLabel(expression?: string): string {
  if (!expression?.trim()) return "Manual";
  const e = expression.trim();
  const presets: Record<string, string> = {
    "0 7 * * *": "Every day at 7:00 AM",
    "0 9 * * 1-5": "Weekdays at 9:00 AM",
    "0 * * * *": "Every hour",
  };
  if (presets[e]) return presets[e]!;

  const parts = e.split(/\s+/);
  if (parts.length !== 5) return e;
  const [min, hour, , , dow] = parts;
  const h = Number(hour);
  const m = Number(min);
  if (
    Number.isFinite(h) &&
    Number.isFinite(m) &&
    hour !== "*" &&
    min !== "*"
  ) {
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    const mm = String(m).padStart(2, "0");
    const time = `${h12}:${mm} ${ampm}`;
    if (dow === "1-5") return `Weekdays at ${time}`;
    if (dow === "*") return `Every day at ${time}`;
    return `At ${time}`;
  }
  return e;
}

export default function ChatRoutines({
  workflows,
  agentSlug,
  onAdd,
  onOpenAll,
}: {
  workflows: Workflow[];
  agentSlug: string | null;
  onAdd: () => void;
  onOpenAll?: () => void;
}) {
  const mine = workflows.filter(
    (w) => !agentSlug || w.agentSlug === agentSlug,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <button
          type="button"
          onClick={onOpenAll}
          className="text-[13px] font-medium text-ink hover:text-ink-2"
        >
          Routines
        </button>
        <button
          type="button"
          aria-label="Add routine"
          onClick={onAdd}
          className="flex size-7 items-center justify-center rounded-[8px] text-ink-3 hover:bg-hover hover:text-ink"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
        {mine.length === 0 ? (
          <p className="px-0.5 text-[12px] leading-snug text-ink-3">
            No routines yet. Ask the bot to schedule one, or tap +.
          </p>
        ) : (
          mine.map((w) => {
            const cron =
              w.trigger.type === "cron" ? w.trigger.expression : undefined;
            const schedule =
              w.trigger.type === "cron"
                ? formatCronLabel(cron)
                : w.trigger.type === "webhook"
                  ? "Webhook"
                  : "Manual";
            return (
              <button
                key={w.slug}
                type="button"
                onClick={onOpenAll}
                className="flex w-full flex-col gap-1 rounded-[10px] px-2.5 py-2 text-left hover:bg-hover"
              >
                <span className="truncate text-[13px] font-medium text-ink">
                  {w.name}
                </span>
                <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
                  <span
                    className={`flex size-4 items-center justify-center rounded-full ${
                      w.enabled ? "bg-green-tint text-green" : "bg-field text-ink-3"
                    }`}
                    aria-hidden
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                  </span>
                  <span className="truncate">
                    {w.enabled ? schedule : `${schedule} · paused`}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>

      <p className="mt-2 px-0.5 text-[11px] leading-snug text-ink-3">
        Runs only while Sora is open on this PC.
      </p>
    </div>
  );
}
