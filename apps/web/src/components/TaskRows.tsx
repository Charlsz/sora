import { useState } from "react";

export type TaskRowData = {
  key: string;
  label: string;
  meta: string;
  status: "pending" | "running" | "failed" | "done";
  enabled?: boolean;
  details?: Array<{ label: string; meta: string }>;
};

function SpinnerRing({
  active,
  children,
}: {
  active?: boolean;
  children?: React.ReactNode;
}) {
  const size = 24;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="absolute inset-0"
        style={active ? { animation: "spin 1.1s linear infinite" } : undefined}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        {active && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * 0.28} ${c * 0.72}`}
          />
        )}
      </svg>
      <span className="relative text-[10.5px] font-semibold tabular-nums text-ink">
        {children}
      </span>
    </span>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "red" | "green";
  children: React.ReactNode;
}) {
  return (
    <span
      className={`flex size-5.5 shrink-0 items-center justify-center rounded-full text-white ${
        tone === "red" ? "bg-red" : "bg-green"
      }`}
      style={{
        animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both",
      }}
    >
      {children}
    </span>
  );
}

export default function TaskRows({
  rows,
  onRun,
  onCopy,
  copiedKey,
  onToggle,
  onDelete,
}: {
  rows: TaskRowData[];
  onRun?: (key: string) => void;
  onCopy?: (key: string, text: string) => void;
  copiedKey?: string | null;
  onToggle?: (key: string, enabled: boolean) => void;
  onDelete?: (key: string) => void;
}) {
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({});

  if (!rows.length) {
    return (
      <p className="text-[13px] text-ink-3">No routines yet.</p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      {rows.map((row, i) => {
        const open = manualOpen[row.key] ?? false;
        return (
          <div
            key={row.key}
            className="self-stretch overflow-hidden bg-surface shadow-card transition-[border-radius,background-color] duration-300 hover:bg-inset"
            style={{
              borderRadius: open ? 14 : 22,
              animation: `fade-up 450ms cubic-bezier(0.23,1,0.32,1) ${i * 80}ms both`,
            }}
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={() =>
                setManualOpen((current) => ({
                  ...current,
                  [row.key]: !open,
                }))
              }
              className="flex h-11 w-full items-center gap-2.5 px-2.5 text-left"
            >
              <span className="flex size-6 shrink-0 items-center justify-center">
                {row.status === "done" ? (
                  <Badge tone="green">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </Badge>
                ) : row.status === "failed" ? (
                  <Badge tone="red">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </Badge>
                ) : (
                  <SpinnerRing active={row.status === "running"}>
                    {i + 1}
                  </SpinnerRing>
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                {row.label}
              </span>
              <span className="text-[12.5px] text-ink-2 tabular-nums">
                {row.meta}
              </span>
              {onRun && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRun(row.key);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      onRun(row.key);
                    }
                  }}
                  className="rounded-full bg-field px-2 py-0.5 text-[11.5px] font-medium text-ink-2 hover:bg-hover"
                >
                  Run
                </span>
              )}
              {onToggle && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(row.key, !(row.enabled ?? true));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      onToggle(row.key, !(row.enabled ?? true));
                    }
                  }}
                  className="rounded-full bg-field px-2 py-0.5 text-[11.5px] font-medium text-ink-2 hover:bg-hover"
                >
                  {row.enabled === false ? "Resume" : "Pause"}
                </span>
              )}
              {onDelete && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(row.key);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      onDelete(row.key);
                    }
                  }}
                  className="rounded-full px-2 py-0.5 text-[11.5px] font-medium text-ink-3 hover:bg-hover hover:text-red"
                >
                  Delete
                </span>
              )}
              <span
                aria-hidden
                className="-ml-1 flex size-7 shrink-0 items-center justify-center rounded-full text-ink-3"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform duration-300"
                  style={{
                    transform: open ? "rotate(180deg)" : "rotate(0)",
                  }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </button>

            <div
              className="grid transition-[grid-template-rows,opacity] duration-300"
              style={{
                gridTemplateRows: open ? "1fr" : "0fr",
                opacity: open ? 1 : 0,
                transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
              }}
            >
              <div className="overflow-hidden">
                <div className="mb-2.5 grid grid-cols-[24px_1fr] gap-2.5 px-2.5">
                  <span aria-hidden className="mx-auto h-full w-px bg-line" />
                  <div className="flex flex-col gap-1.5">
                    {(row.details ?? []).map((d, j) => (
                      <div
                        key={d.label}
                        className="flex items-center justify-between"
                        style={
                          open
                            ? {
                                animation: `fade-up 300ms cubic-bezier(0.23,1,0.32,1) ${120 + j * 100}ms both`,
                              }
                            : undefined
                        }
                      >
                        <span className="text-[12px] text-ink-2">{d.label}</span>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-mono text-[11.5px] text-ink-3 tabular-nums">
                            {d.meta}
                          </span>
                          {onCopy &&
                            d.label === "Webhook" &&
                            d.meta.includes("/api/hooks/") && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCopy(`${row.key}-webhook`, d.meta);
                                }}
                                className="shrink-0 rounded-full bg-field px-2 py-0.5 text-[10.5px] text-ink-2 hover:bg-hover"
                              >
                                {copiedKey === `${row.key}-webhook`
                                  ? "Copied"
                                  : "Copy"}
                              </button>
                            )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
