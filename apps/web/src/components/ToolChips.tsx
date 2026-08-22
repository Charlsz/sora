import { useState } from "react";

export type ToolRow = {
  id: string;
  icon?: "think" | "write" | "run" | "read";
  label: string;
  chip: string;
  mono?: boolean;
  status: "started" | "completed" | "failed";
  detail?: string[];
};

const Icons: Record<string, React.ReactNode> = {
  think: (
    <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
  ),
  write: (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </g>
  ),
  run: (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 17l6-5-6-5M12 19h8" />
    </g>
  ),
  read: (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </g>
  ),
};

function guessIcon(name: string): keyof typeof Icons {
  const n = name.toLowerCase();
  if (n.includes("write") || n.includes("edit") || n.includes("fs"))
    return "write";
  if (n.includes("exec") || n.includes("run") || n.includes("terminal"))
    return "run";
  if (n.includes("read") || n.includes("list") || n.includes("cat"))
    return "read";
  return "think";
}

export default function ToolChips({
  rows,
  summary,
}: {
  rows: ToolRow[];
  summary?: string;
}) {
  const [open, setOpen] = useState(true);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) =>
    setOpenRows((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (!rows.length) return null;

  return (
    <div className="w-full max-w-95 pb-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((c) => !c)}
        className="-mx-1.5 flex w-fit items-center gap-1.5 rounded-control px-1.5 py-1 text-[12.5px] text-ink-2 transition-colors duration-100 hover:bg-hover-2"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-200"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span className="tabular-nums">
          {summary ?? `${rows.length} tool call${rows.length === 1 ? "" : "s"}`}
        </span>
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
        }}
      >
        <div className="-mx-1 overflow-hidden px-1.5 pb-1">
          <div className="mt-1.5 flex flex-col gap-1">
            {rows.map((row) => {
              const rowOpen = openRows.has(row.id);
              const icon = row.icon ?? guessIcon(row.label);
              return (
                <div
                  key={row.id}
                  style={{
                    animation:
                      "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both",
                  }}
                >
                  <button
                    type="button"
                    aria-expanded={rowOpen}
                    onClick={() => toggleRow(row.id)}
                    className="group/row -mx-[3px] flex h-7 w-[calc(100%+6px)] min-w-0 items-center gap-2 rounded-control px-[3px] text-left transition-colors duration-100 hover:bg-hover-2"
                  >
                    <span className="relative flex size-4 shrink-0 items-center justify-center text-ink-3">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill={icon === "think" ? "currentColor" : "none"}
                        stroke="currentColor"
                        className={`transition-opacity duration-100 group-hover/row:opacity-0 ${rowOpen ? "opacity-0" : ""}`}
                      >
                        {Icons[icon]}
                      </svg>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`absolute transition-[opacity,transform] duration-150 group-hover/row:opacity-100 ${rowOpen ? "opacity-100" : "opacity-0"}`}
                        style={{
                          transform: rowOpen ? "rotate(0deg)" : "rotate(-90deg)",
                        }}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </span>
                    <span className="shrink-0 text-[12.5px] font-medium text-ink">
                      {row.label}
                    </span>
                    <span
                      className={`inline-flex h-5.5 min-w-0 flex-1 cursor-pointer items-center truncate rounded-chip bg-field px-1.5 text-[11.5px] text-ink-2 shadow-hairline ${row.mono ? "font-mono" : ""}`}
                    >
                      {row.chip}
                    </span>
                    {row.status === "failed" && (
                      <span className="shrink-0 text-[11px] font-medium text-red">
                        failed
                      </span>
                    )}
                    {row.status === "started" && (
                      <span
                        className="size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
                        style={{ animation: "spin 700ms linear infinite" }}
                      />
                    )}
                  </button>

                  {row.detail && row.detail.length > 0 && (
                    <div
                      className="grid transition-[grid-template-rows,opacity] duration-300"
                      style={{
                        gridTemplateRows: rowOpen ? "1fr" : "0fr",
                        opacity: rowOpen ? 1 : 0,
                      }}
                    >
                      <div className="min-h-0 overflow-hidden">
                        <div className="mt-0.5 mb-1 ml-2 flex flex-col gap-0.5 border-l border-line py-0.5 pl-3.5">
                          {row.detail.map((line) => (
                            <span
                              key={line}
                              className="truncate font-mono text-[11.5px] leading-[1.6] text-ink-2"
                            >
                              {line}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
