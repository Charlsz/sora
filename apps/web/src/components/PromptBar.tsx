import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

function Icon({
  children,
  size = 15,
  strokeWidth = 1.8,
}: {
  children: ReactNode;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export type PromptMenuItem = {
  key: string;
  name: string;
  desc: string;
};

function parseToken(
  draft: string,
): { kind: "at" | "slash"; query: string; start: number } | null {
  const match = /(^|\s)([@/])([\w-]*)$/.exec(draft);
  if (!match) return null;
  return {
    kind: match[2] === "@" ? "at" : "slash",
    query: match[3]!.toLowerCase(),
    start: match.index + match[1]!.length,
  };
}

export default function PromptBar({
  variant = "Rounded",
  placeholder = "Message an agent…  @agent  /skill",
  disabled = false,
  agents = [],
  skills = [],
  models = [],
  connections = [],
  model,
  onModelChange,
  onSend,
  onConnect,
  onManageConnections,
}: {
  variant?: string;
  placeholder?: string;
  disabled?: boolean;
  agents?: PromptMenuItem[];
  skills?: PromptMenuItem[];
  models?: PromptMenuItem[];
  /** Apps the user can link (Composio, etc.). Shown from the + button. */
  connections?: PromptMenuItem[];
  model?: string;
  onModelChange?: (key: string) => void;
  onSend?: (text: string) => void;
  onConnect?: (key: string) => void;
  onManageConnections?: () => void;
}) {
  const pill = variant === "Pill";
  const [draft, setDraft] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [rowBox, setRowBox] = useState<{ top: number; height: number } | null>(
    null,
  );
  const [modelBox, setModelBox] = useState<{
    top: number;
    height: number;
  } | null>(null);
  const [modelHovered, setModelHovered] = useState<number | null>(null);
  const [modelMenuLeft, setModelMenuLeft] = useState(0);
  const [modelMenuBottom, setModelMenuBottom] = useState(0);
  const composerAnchorRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const modelRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const modelRowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const token = dismissed ? null : parseToken(draft);
  const menu: "at" | "slash" | null = token?.kind ?? null;
  const query = token?.query ?? "";

  const rows: PromptMenuItem[] =
    menu === "at"
      ? agents.filter((s) => s.name.toLowerCase().includes(query))
      : menu === "slash"
        ? skills.filter((c) =>
            c.name.replace(/^\//, "").toLowerCase().startsWith(query),
          )
        : [];

  const connectionRows = connections;

  useEffect(() => {
    setActive(0);
    setEngaged(false);
  }, [menu, query, plusOpen]);

  useLayoutEffect(() => {
    const list = plusOpen ? connectionRows : rows;
    const target = rowRefs.current[active];
    if (target && list.length)
      setRowBox({ top: target.offsetTop, height: target.offsetHeight });
  }, [menu, query, active, rows.length, plusOpen, connectionRows.length]);

  const modelIndex = Math.max(
    0,
    models.findIndex((m) => m.key === model),
  );
  useLayoutEffect(() => {
    if (!modelOpen) return;
    const target = modelRowRefs.current[modelHovered ?? modelIndex];
    if (target)
      setModelBox({ top: target.offsetTop, height: target.offsetHeight });
  }, [modelOpen, modelHovered, modelIndex]);

  useLayoutEffect(() => {
    if (!modelOpen || !composerAnchorRef.current || !modelRef.current) return;
    const anchorRect = composerAnchorRef.current.getBoundingClientRect();
    const triggerRect = modelRef.current.getBoundingClientRect();
    setModelMenuLeft(
      Math.max(
        0,
        Math.min(triggerRect.left - anchorRect.left, anchorRect.width - 176),
      ),
    );
    setModelMenuBottom(anchorRect.bottom - triggerRect.top + 8);
  }, [modelOpen, model]);

  useEffect(() => {
    if (!modelOpen) setModelHovered(null);
  }, [modelOpen]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const controls = controlsRef.current;
    const measure = measureRef.current;
    const modelButton = modelRef.current;
    if (!input || !controls || !measure || !modelButton) return;

    const fixedControlsWidth = 28 * 2 + modelButton.offsetWidth;
    const inlineGaps = 4 * 3;
    const inlineInputWidth =
      controls.clientWidth - fixedControlsWidth - inlineGaps;
    const needsFullWidth =
      draft.includes("\n") || measure.offsetWidth + 8 > inlineInputWidth;
    if (needsFullWidth !== expanded) setExpanded(needsFullWidth);

    const minHeight = 28;
    const maxHeight = 100;
    input.style.height = "0px";
    const contentHeight = input.scrollHeight;
    input.style.height = `${Math.min(Math.max(contentHeight, minHeight), maxHeight)}px`;
    input.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }, [draft, expanded]);

  useEffect(() => {
    if (!modelOpen && !plusOpen) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element).closest("[data-promptbar]")) {
        setModelOpen(false);
        setPlusOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [modelOpen, plusOpen]);

  const closeMenus = () => {
    setPlusOpen(false);
    setModelOpen(false);
  };

  const pick = (row: PromptMenuItem) => {
    if (menu === "at") {
      setDraft(`${token ? draft.slice(0, token.start) : draft}@${row.name} `);
    } else {
      const name = row.name.startsWith("/") ? row.name : `/${row.name}`;
      setDraft(`${token ? draft.slice(0, token.start) : draft}${name} `);
    }
    setPlusOpen(false);
    setDismissed(false);
    inputRef.current?.focus();
  };

  const canSend = draft.trim().length > 0 && !disabled;
  const send = () => {
    if (!canSend) return;
    onSend?.(draft.trim());
    setDraft("");
    closeMenus();
  };

  const selectedModel =
    models.find((m) => m.key === model) ?? models[modelIndex] ?? models[0];

  return (
    <div data-promptbar className="w-full">
      <div ref={composerAnchorRef} className="relative">
        {plusOpen && (
          <div
            className="absolute inset-x-0 bottom-full z-10 mb-2 rounded-[10px] bg-surface p-1 shadow-raised"
            style={{
              animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
              transformOrigin: "bottom center",
            }}
          >
            <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-3">
              Connect apps
            </p>
            {connectionRows.map((row, i) => (
              <button
                key={row.key}
                type="button"
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => {
                  setActive(i);
                  setEngaged(true);
                }}
                onClick={() => {
                  onConnect?.(row.key);
                  setPlusOpen(false);
                }}
                className="relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left hover:bg-hover"
              >
                <span className="shrink-0 text-[12.5px] font-medium text-ink">
                  {row.name}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
                  {row.desc}
                </span>
              </button>
            ))}
            {connectionRows.length === 0 && (
              <div className="flex h-9 items-center px-2 text-[12px] text-ink-3">
                Add a Composio key under Connected apps first
              </div>
            )}
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onManageConnections?.();
                setPlusOpen(false);
              }}
              className="mt-1 flex h-8 w-full items-center border-t border-line px-2 text-left text-[12px] font-medium text-ink-2 hover:bg-hover"
            >
              Manage all connections…
            </button>
          </div>
        )}

        {!plusOpen && menu && (
          <div
            onMouseLeave={() => setEngaged(false)}
            className="absolute inset-x-0 bottom-full z-10 mb-2 rounded-[10px] bg-surface p-1 shadow-raised"
            style={{
              animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
              transformOrigin: "bottom center",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-1 rounded-[6px] bg-hover"
              style={{
                top: rowBox?.top ?? 0,
                height: rowBox?.height ?? 0,
                opacity: rowBox && engaged && rows.length > 0 ? 1 : 0,
                transition:
                  "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
              }}
            />
            {rows.map((row, i) => (
              <button
                key={row.key}
                type="button"
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => {
                  setActive(i);
                  setEngaged(true);
                }}
                onClick={() => pick(row)}
                className="relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left"
              >
                <span className="shrink-0 text-[12.5px] font-medium text-ink">
                  {row.name}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
                  {row.desc}
                </span>
              </button>
            ))}
            {rows.length === 0 && (
              <div className="flex h-9 items-center px-2 text-[12px] text-ink-3">
                No matches for “{query}”
              </div>
            )}
            <div className="mt-1 border-t border-line px-2 pt-1.5 pb-1 text-[11px] text-ink-3">
              {menu === "at"
                ? "Type to filter teammates"
                : "Type to filter skills"}
            </div>
          </div>
        )}

        {modelOpen && models.length > 0 && (
          <div
            onMouseLeave={() => setModelHovered(null)}
            className="absolute z-10 w-44 rounded-[10px] bg-surface p-1 shadow-raised"
            style={{
              left: modelMenuLeft,
              bottom: modelMenuBottom,
              animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
              transformOrigin: "bottom left",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-1 rounded-[6px] bg-hover"
              style={{
                top: modelBox?.top ?? 0,
                height: modelBox?.height ?? 0,
                opacity: modelBox && modelHovered !== null ? 1 : 0,
                transition:
                  "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
              }}
            />
            {models.map((m, i) => (
              <button
                key={m.key}
                type="button"
                ref={(el) => {
                  modelRowRefs.current[i] = el;
                }}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setModelHovered(i)}
                onClick={() => {
                  onModelChange?.(m.key);
                  setModelOpen(false);
                  inputRef.current?.focus();
                }}
                className="relative z-10 flex h-7.5 w-full items-center gap-2 rounded-[6px] px-2 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                  {m.name}
                </span>
                <span
                  className={`shrink-0 text-ink ${m.key === selectedModel?.key ? "" : "invisible"}`}
                >
                  <Icon size={13} strokeWidth={2.5}>
                    <path d="M20 6L9 17l-5-5" />
                  </Icon>
                </span>
              </button>
            ))}
          </div>
        )}

        <div
          className={`relative isolate flex flex-col overflow-hidden border border-line bg-surface shadow-card transition-[border-color,border-radius] duration-150 focus-within:border-line-strong gap-1.5 p-1.5 ${
            pill
              ? expanded
                ? "rounded-[24px]"
                : "rounded-full"
              : "rounded-[14px]"
          }`}
        >
          <span
            ref={measureRef}
            aria-hidden
            className="pointer-events-none absolute invisible whitespace-pre text-[13px] leading-[18px]"
          >
            {draft}
          </span>

          <div
            ref={controlsRef}
            className={`grid items-end gap-x-1 gap-y-1.5 ${
              expanded
                ? "grid-cols-[28px_auto_minmax(0,1fr)_28px]"
                : "grid-cols-[28px_minmax(0,1fr)_auto_28px]"
            }`}
          >
            <button
              type="button"
              aria-label="Connect apps"
              aria-expanded={plusOpen}
              disabled={disabled}
              onClick={() => {
                setModelOpen(false);
                setPlusOpen((c) => !c);
                inputRef.current?.focus();
              }}
              className={`flex size-7 shrink-0 items-center justify-center justify-self-start border border-line text-ink transition-[background-color,color,transform] duration-150 hover:bg-hover active:scale-[0.94] disabled:opacity-40 ${
                pill ? "rounded-full" : "rounded-[8px]"
              } ${plusOpen ? "bg-hover border-line-strong" : "bg-field"} ${expanded ? "col-start-1 row-start-2" : "col-start-1 row-start-1"}`}
            >
              <Icon size={15} strokeWidth={2.2}>
                <path d="M12 5v14M5 12h14" />
              </Icon>
            </button>

            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              disabled={disabled}
              onChange={(event) => {
                setDraft(event.target.value);
                setDismissed(false);
                setPlusOpen(false);
              }}
              onKeyDown={(event) => {
                if (menu && rows.length > 0) {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    setEngaged(true);
                    setActive(
                      (current) =>
                        (current +
                          (event.key === "ArrowDown" ? 1 : rows.length - 1)) %
                        rows.length,
                    );
                    return;
                  }
                  if (
                    (event.key === "Enter" && !event.shiftKey) ||
                    event.key === "Tab"
                  ) {
                    event.preventDefault();
                    pick(rows[active]!);
                    return;
                  }
                }
                if (event.key === "Escape") {
                  setDismissed(true);
                  closeMenus();
                  return;
                }
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder={placeholder}
              aria-label="Prompt"
              className={`min-h-7 min-w-0 w-full resize-none bg-transparent px-1 py-[5px] text-[13px] leading-[18px] text-ink outline-none [overflow-wrap:anywhere] placeholder:text-ink-3 disabled:opacity-50 ${
                expanded
                  ? "col-span-full col-start-1 row-start-1"
                  : "col-start-2 row-start-1"
              }`}
            />

            {models.length > 0 && (
              <button
                ref={modelRef}
                type="button"
                aria-expanded={modelOpen}
                aria-label="Choose model"
                disabled={disabled}
                onClick={() => {
                  setPlusOpen(false);
                  setModelOpen((c) => !c);
                }}
                className={`flex h-7 shrink-0 items-center gap-1 px-1.5 text-[12px] font-medium text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink disabled:opacity-40 ${
                  pill ? "rounded-full" : "rounded-[8px]"
                } ${expanded ? "col-start-2 row-start-2 justify-self-start" : "col-start-3 row-start-1"}`}
              >
                {selectedModel?.name ?? "Model"}
                <span className="text-ink-3">
                  <Icon size={11} strokeWidth={2.4}>
                    <path d="M6 9l6 6 6-6" />
                  </Icon>
                </span>
              </button>
            )}

            <button
              type="button"
              aria-label="Send"
              disabled={!canSend}
              onClick={send}
              className={`flex size-7 shrink-0 items-center justify-center transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.94] ${
                pill ? "rounded-full" : "rounded-[8px]"
              } ${expanded ? "col-start-4 row-start-2" : "col-start-4 row-start-1"}`}
              style={{
                background: canSend ? "var(--ink)" : "var(--line-strong)",
                color: canSend ? "var(--surface)" : "var(--ink-2)",
              }}
            >
              <Icon size={16} strokeWidth={2.4}>
                <path d="M12 19V5M5 12l7-7 7 7" />
              </Icon>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
