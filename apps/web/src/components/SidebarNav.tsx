import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import GlideMenu from "./GlideMenu";

export type SidebarRecent = {
  id: string;
  /** Teammate display name */
  label: string;
  /** Short role (e.g. Inbox, Research), shown with name if set */
  role?: string;
  /** What they’re doing right now */
  activity?: string;
  /** Stable color for the circle */
  color?: string;
};

type SidebarNavProps = {
  brand?: string;
  monogram?: string;
  displayName?: string | null;
  activeId?: string | null;
  className?: string;
  fill?: boolean;
  onNewTeammate?: () => void;
  onPick?: (id: string, label: string) => void;
  activeNav?: string;
  onNavigate?: (key: string) => void;
  footerLabel?: string;
  onFooterClick?: () => void;
  teammates?: SidebarRecent[];
  moreItems?: Array<{ key: string; label: string }>;
  online?: boolean | null;
};

const SIDEBAR_MOTION = {
  expandedWidth: 260,
  collapsedWidth: 56,
  duration: 280,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
};

const CIRCLE_COLORS = [
  "#3D8B7A",
  "#5B7CDE",
  "#8B6BC9",
  "#C45C6A",
  "#C48A3A",
  "#4A9B9B",
  "#7A6B9E",
  "#6B8F4E",
];

export function teammateColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return CIRCLE_COLORS[Math.abs(h) % CIRCLE_COLORS.length]!;
}

function Icon({
  children,
  size = 18,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function PanelToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <Icon size={16}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      {collapsed ? (
        <path d="M13 9l3 3-3 3" />
      ) : (
        <path d="M15 9l-3 3 3 3" />
      )}
    </Icon>
  );
}

export default function SidebarNav({
  displayName,
  activeId,
  className = "",
  fill = false,
  onNewTeammate,
  onPick,
  activeNav,
  onNavigate,
  footerLabel = "Settings",
  onFooterClick,
  teammates = [],
  moreItems = [],
}: SidebarNavProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [internalNav, setInternalNav] = useState("chats");
  const currentNav = activeNav ?? internalNav;
  const selectNav = (key: string) => {
    setInternalNav(key);
    onNavigate?.(key);
  };
  const [moreOpen, setMoreOpen] = useState(false);
  const [morePos, setMorePos] = useState({ top: 0, left: 0 });
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");

  const visible = teammates.filter((t) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      t.label.toLowerCase().includes(q) ||
      (t.role?.toLowerCase().includes(q) ?? false) ||
      (t.activity?.toLowerCase().includes(q) ?? false)
    );
  });

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        !target.closest("[data-more-trigger]") &&
        !target.closest("[data-more-menu]")
      ) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [moreOpen]);

  const initials = (displayName || "You")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside
      data-sidebar-collapsed={collapsed}
      aria-label="Teammates"
      className={`relative flex shrink-0 flex-col overflow-hidden border-r border-line bg-panel transition-[width] ${fill ? "h-full" : "h-[600px]"} ${className}`}
      style={
        {
          width: collapsed
            ? SIDEBAR_MOTION.collapsedWidth
            : SIDEBAR_MOTION.expandedWidth,
          transitionDuration: `${SIDEBAR_MOTION.duration}ms`,
          transitionTimingFunction: SIDEBAR_MOTION.easing,
        } as CSSProperties
      }
    >
      {collapsed ? (
        <div className="flex h-full w-[56px] flex-col items-center gap-1 py-2">
          <button
            type="button"
            aria-label="Show teammates panel"
            title="Show panel"
            onClick={() => setCollapsed(false)}
            className="flex size-9 items-center justify-center rounded-[10px] bg-field text-ink-2 hover:bg-hover hover:text-ink"
          >
            <PanelToggleIcon collapsed />
          </button>
          <button
            type="button"
            aria-label="New teammate"
            onClick={() => onNewTeammate?.()}
            className="flex size-9 items-center justify-center rounded-[10px] text-ink-2 hover:bg-hover hover:text-ink"
          >
            <Icon size={16}>
              <path d="M12 5v14M5 12h14" />
            </Icon>
          </button>
          <div className="my-1 h-px w-7 bg-line" />
          <div className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto py-1">
            {teammates.map((t) => {
              const active = activeId === t.id;
              const color = t.color ?? teammateColor(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  title={t.label}
                  aria-label={t.label}
                  onClick={() => {
                    selectNav("chats");
                    onPick?.(t.id, t.label);
                  }}
                  className={`flex size-9 items-center justify-center rounded-full ${
                    active ? "ring-2 ring-ink ring-offset-1 ring-offset-panel" : ""
                  }`}
                >
                  <span
                    className="size-7 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-label={footerLabel}
            title={displayName?.trim() || "You"}
            onClick={onFooterClick}
            className="mb-1 flex size-9 items-center justify-center rounded-full bg-field text-[11px] font-semibold text-ink-2 hover:bg-hover"
          >
            {initials}
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 w-full flex-1 flex-col py-2">
          <div className="mx-2 mb-2 flex items-center gap-1">
            <div className="flex min-w-0 flex-1 items-center rounded-[10px] bg-field px-2.5">
              <Icon size={14}>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3-3" />
              </Icon>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="h-8 min-w-0 flex-1 bg-transparent px-2 text-[13px] text-ink outline-none placeholder:text-ink-3"
              />
            </div>
            <button
              type="button"
              aria-label="New teammate"
              onClick={() => onNewTeammate?.()}
              className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-field text-ink-2 hover:bg-hover hover:text-ink"
            >
              <Icon size={16}>
                <path d="M12 5v14M5 12h14" />
              </Icon>
            </button>
            {moreItems.length > 0 && (
              <button
                ref={moreBtnRef}
                data-more-trigger
                type="button"
                aria-label="More"
                onClick={() => {
                  if (moreBtnRef.current) {
                    const rect = moreBtnRef.current.getBoundingClientRect();
                    setMorePos({ top: rect.bottom + 4, left: rect.left });
                  }
                  setMoreOpen((o) => !o);
                }}
                className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-field text-ink-2 hover:bg-hover hover:text-ink"
              >
                <Icon size={16}>
                  <circle
                    cx="5"
                    cy="12"
                    r="1.5"
                    fill="currentColor"
                    stroke="none"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="1.5"
                    fill="currentColor"
                    stroke="none"
                  />
                  <circle
                    cx="19"
                    cy="12"
                    r="1.5"
                    fill="currentColor"
                    stroke="none"
                  />
                </Icon>
              </button>
            )}
            <button
              type="button"
              aria-label="Hide teammates panel"
              title="Hide panel"
              onClick={() => setCollapsed(true)}
              className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-field text-ink-2 hover:bg-hover hover:text-ink"
            >
              <PanelToggleIcon collapsed={false} />
            </button>
          </div>

          {moreOpen &&
            createPortal(
              <div
                data-more-menu
                className="fixed z-50 w-48 rounded-[12px] bg-surface p-1 shadow-overlay"
                style={{
                  top: morePos.top,
                  left: morePos.left,
                  animation: "pop-in 160ms cubic-bezier(0.23,1,0.32,1) both",
                }}
              >
                {moreItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      selectNav(item.key);
                    }}
                    className={`flex h-9 w-full items-center rounded-[8px] px-2.5 text-left text-[13.5px] font-medium ${
                      currentNav === item.key
                        ? "bg-hover-2 text-ink"
                        : "text-ink-2 hover:bg-hover"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>,
              document.body,
            )}

          <div className="min-h-0 flex-1 overflow-y-auto px-1.5">
            <GlideMenu
              rowSelector="[data-row]"
              highlightClassName="sidebar-glide-highlight rounded-[12px] bg-hover-2"
              className="group/glide flex flex-col gap-0.5"
            >
              {visible.map((t) => {
                const active = activeId === t.id;
                const color = t.color ?? teammateColor(t.id);
                return (
                  <button
                    key={t.id}
                    data-row
                    type="button"
                    onClick={() => {
                      selectNav("chats");
                      onPick?.(t.id, t.label);
                    }}
                    className={`sidebar-row relative z-10 flex w-full items-start gap-2.5 rounded-[12px] px-2.5 py-2.5 text-left transition-[background-color,transform] duration-150 active:scale-[0.99] ${
                      active
                        ? "bg-hover-2 group-hover/glide:bg-transparent"
                        : "hover:bg-hover/60"
                    }`}
                  >
                    <span
                      className="mt-0.5 size-8 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">
                        {t.label}
                        {t.role ? (
                          <span className="ml-1.5 font-normal text-ink-3">
                            {t.role}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-ink-3">
                        {t.activity || "Idle"}
                      </span>
                    </span>
                  </button>
                );
              })}
              {query && visible.length === 0 && (
                <p className="px-3 py-3 text-[12.5px] text-ink-3">
                  No teammates match
                </p>
              )}
              {!query && teammates.length === 0 && (
                <p className="px-3 py-3 text-[12.5px] text-ink-3">
                  No teammates yet. Tap + to create one
                </p>
              )}
            </GlideMenu>
          </div>

          <div className="mx-2 mt-2 border-t border-line pt-2">
            <button
              type="button"
              onClick={onFooterClick}
              className="flex h-11 w-full items-center gap-2.5 rounded-[12px] px-2 text-left hover:bg-hover-2"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-field text-[11px] font-semibold text-ink-2">
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">
                  {displayName?.trim() || "You"}
                </span>
                <span className="block truncate text-[11px] text-ink-3">
                  {footerLabel}
                </span>
              </span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
