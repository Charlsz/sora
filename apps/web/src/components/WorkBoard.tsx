import type { ToolRow } from "./ToolChips";

export type WorkerStatus =
  | "idle"
  | "working"
  | "needs_you"
  | "done"
  | "failed";

function friendlyToolLabel(raw: string): string {
  const n = raw.toLowerCase();
  if (n.includes("browser") || n.includes("navigate") || n.includes("screenshot"))
    return "Browser";
  if (n.includes("terminal") || n.includes("exec") || n.includes("shell"))
    return "Terminal";
  if (n.includes("write") || n.includes("fs.write") || n.includes("edit"))
    return "Wrote file";
  if (n.includes("list") || n.includes("read") || n.includes("fs."))
    return "Inspected files";
  if (n.includes("http") || n.includes("fetch") || n.includes("request"))
    return "Web request";
  if (n.includes("delegate") || n.includes("agent"))
    return "Messaged teammate";
  if (n.includes("memory")) return "Memory";
  return raw.replace(/[_.:]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusCopy(status: WorkerStatus): string {
  switch (status) {
    case "working":
      return "Working";
    case "needs_you":
      return "Needs your approval";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return "Idle";
  }
}

export default function WorkBoard({
  workerName,
  taskTitle,
  status,
  rows,
}: {
  workerName: string;
  taskTitle?: string | null;
  status: WorkerStatus;
  rows: ToolRow[];
}) {
  const dot =
    status === "working"
      ? "bg-accent animate-pulse"
      : status === "needs_you"
        ? "bg-orange"
        : status === "failed"
          ? "bg-red"
          : status === "done"
            ? "bg-green"
            : "bg-ink-3";

  return (
    <div className="rounded-[14px] border border-line bg-surface px-4 py-3 shadow-card">
      <div className="flex items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${dot}`} />
        <span className="text-[14px] font-semibold text-ink">{workerName}</span>
        <span className="text-[12px] font-medium text-ink-2">
          {statusCopy(status)}
        </span>
      </div>

      {taskTitle && (
        <p className="mt-2 text-[13px] leading-snug text-ink-3">{taskTitle}</p>
      )}

      {(rows.length > 0 || status === "working") && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-3">
            Activity
          </p>
          <ul className="flex flex-col gap-1.5">
            {rows.length === 0 && status === "working" && (
              <li className="flex gap-2 text-[12.5px] text-ink-2">
                <span className="text-ink-3">●</span>
                Thinking…
              </li>
            )}
            {rows.map((row) => {
              const active = row.status === "started";
              const failed = row.status === "failed";
              const mark = failed ? "✗" : active ? "●" : "✓";
              const detail = row.detail?.[0]?.slice(0, 100);
              return (
                <li key={row.id} className="flex gap-2 text-[12.5px]">
                  <span
                    className={`shrink-0 ${
                      failed
                        ? "text-red"
                        : active
                          ? "text-accent"
                          : "text-green"
                    }`}
                  >
                    {mark}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={active ? "font-medium text-ink" : "text-ink-2"}>
                      {friendlyToolLabel(row.label)}
                      {active ? "…" : ""}
                    </span>
                    {detail && (
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-ink-3">
                        {detail}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
