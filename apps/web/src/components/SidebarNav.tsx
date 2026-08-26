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
  label: string;
  prompt?: string;
  /** Indent under bots (e.g. conversations) */
  nested?: boolean;
  /** Teammate status line (Working / Idle) */
  status?: string;
  /** True for agent rows (show circle icon) */
  teammate?: boolean;
};

type SidebarNavProps = {
  brand?: string;
  monogram?: string;
  activeTitle?: string | null;
  /** Selected list row id (`agent:slug` or `conv:id`). */
  activeId?: string | null;
  className?: string;
  fill?: boolean;
  onNewChat?: () => void;
  onPick?: (id: string, label: string, prompt?: string) => void;
  activeNav?: string;
  onNavigate?: (key: string) => void;
  footerLabel?: string;
  onFooterClick?: () => void;
  /** Primary list — bots (and optional nested conversations). */
  recents?: SidebarRecent[];
  /** Section heading above the list. */
  listLabel?: string;
  /** Power features under More (routines, models, …). */
  moreItems?: Array<{ key: string; label: string }>;
  /** Quiet runtime status. */
  online?: boolean | null;
};

const SIDEBAR_MOTION = {
  expandedWidth: 224,
  collapsedWidth: 52,
  duration: 280,
  copyDuration: 180,
  copyOffset: 8,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
};

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

function GlideGroup({ children }: { children: ReactNode }) {
  return (
    <GlideMenu
      rowSelector="[data-row]"
      highlightClassName="sidebar-glide-highlight rounded-[7px] bg-hover-2"
      className="group/glide flex flex-col gap-px"
    >
      {children}
    </GlideMenu>
  );
}

function RailButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      data-row
      type="button"
      onClick={onClick}
      className={`sidebar-row relative z-10 mx-2 flex h-8 items-center rounded-[8px] px-2 text-left
        transition-[width,background-color,color,transform] duration-150 active:scale-[0.98]
        ${active ? "bg-hover-2 group-hover/glide:bg-transparent" : ""}`}
    >
      <span
        className={`flex size-5 shrink-0 items-center justify-center ${active ? "text-ink" : "text-ink-2"}`}
      >
        {icon}
      </span>
      <span
        className={`sidebar-copy ml-1.5 min-w-0 flex-1 truncate text-[14px] font-medium ${active ? "text-ink" : "text-ink-2"}`}
      >
        {label}
      </span>
    </button>
  );
}

export default function SidebarNav({
  brand = "Sora",
  monogram = "S",
  activeTitle,
  activeId,
  className = "",
  fill = false,
  onNewChat,
  onPick,
  activeNav,
  onNavigate,
  footerLabel = "Settings",
  onFooterClick,
  recents = [],
  listLabel = "Bots",
  moreItems = [],
  online = null,
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
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspacePosition, setWorkspacePosition] = useState({
    top: 0,
    left: 0,
  });
  const [query, setQuery] = useState("");
  const workspaceButtonRef = useRef<HTMLButtonElement>(null);

  const visibleRecents = recents.filter((item) =>
    item.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!workspaceOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        !target.closest("[data-workspace-trigger]") &&
        !target.closest("[data-workspace-menu]")
      ) {
        setWorkspaceOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [workspaceOpen]);

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

  const collapse = () => {
    setCollapsed(true);
    setWorkspaceOpen(false);
    setMoreOpen(false);
    setQuery("");
  };

  return (
    <aside
      data-sidebar-collapsed={collapsed}
      aria-label="Workspace navigation"
      className={`relative flex shrink-0 overflow-hidden border-r border-line bg-panel transition-[width] ${fill ? "h-full" : "h-[600px]"} ${className}`}
      style={
        {
          width: collapsed
            ? SIDEBAR_MOTION.collapsedWidth
            : SIDEBAR_MOTION.expandedWidth,
          transitionDuration: `${SIDEBAR_MOTION.duration}ms`,
          transitionTimingFunction: SIDEBAR_MOTION.easing,
          "--sidebar-copy-duration": `${SIDEBAR_MOTION.copyDuration}ms`,
          "--sidebar-copy-offset": `${SIDEBAR_MOTION.copyOffset}px`,
          "--sidebar-easing": SIDEBAR_MOTION.easing,
        } as CSSProperties
      }
    >
      <div className="flex min-h-0 w-[224px] shrink-0 flex-col py-2">
        <div className="relative mb-2.5 h-10 shrink-0">
          <button
            ref={workspaceButtonRef}
            data-workspace-trigger
            type="button"
            aria-expanded={workspaceOpen}
            aria-hidden={collapsed}
            tabIndex={collapsed ? -1 : 0}
            onClick={() => {
              if (!workspaceOpen && workspaceButtonRef.current) {
                const rect =
                  workspaceButtonRef.current.getBoundingClientRect();
                setWorkspacePosition({
                  top: rect.bottom + 6,
                  left: rect.left,
                });
              }
              setWorkspaceOpen((open) => !open);
            }}
            className="sidebar-workspace-control absolute top-1 left-2 flex h-8 w-[164px] items-center rounded-[8px] px-2 text-left transition-[background-color,transform] duration-100 hover:bg-hover-2 active:scale-[0.99]"
          >
            <span className="sidebar-logo flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-ink text-[10px] font-semibold text-surface">
              {monogram}
            </span>
            <span className="sidebar-copy ml-1.5 min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
              {brand}
            </span>
            {online !== null && (
              <span
                className={`sidebar-copy size-1.5 shrink-0 rounded-full ${online ? "bg-green" : "bg-ink-3"}`}
                title={online ? "Runtime online" : "Connecting…"}
              />
            )}
          </button>

          {workspaceOpen &&
            createPortal(
              <div
                data-workspace-menu
                className="fixed z-50 w-56 rounded-[14px] bg-surface p-1.5 shadow-overlay"
                style={{
                  top: workspacePosition.top,
                  left: workspacePosition.left,
                  animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
                }}
              >
                <p className="px-2 py-1.5 text-[12px] text-ink-3">
                  Local workspace · ~/.sora
                </p>
              </div>,
              document.body,
            )}

          <button
            type="button"
            aria-label="Collapse sidebar"
            aria-hidden={collapsed}
            tabIndex={collapsed ? -1 : 0}
            onClick={collapse}
            className="sidebar-collapse-control absolute top-1 right-2 flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-[opacity,background-color,color] duration-150 hover:bg-hover-2 hover:text-ink"
          >
            <Icon size={18}>
              <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
            </Icon>
          </button>
          <button
            type="button"
            aria-label="Expand sidebar"
            aria-hidden={!collapsed}
            tabIndex={collapsed ? 0 : -1}
            onClick={() => setCollapsed(false)}
            className="sidebar-expand-control absolute top-0.5 left-2 flex size-9 items-center justify-center rounded-[8px] text-ink-3 transition-[opacity,background-color,color] duration-150 hover:bg-hover-2 hover:text-ink"
          >
            <Icon size={18}>
              <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
            </Icon>
          </button>
        </div>

        <GlideGroup>
          <RailButton
            icon={
              <Icon size={18}>
                <path d="M12 5v14M5 12h14" />
              </Icon>
            }
            label="New teammate"
            onClick={() => {
              selectNav("agents");
              onNewChat?.();
            }}
          />
          {moreItems.length > 0 && (
            <button
              ref={moreBtnRef}
              data-row
              data-more-trigger
              type="button"
              onClick={() => {
                if (moreBtnRef.current) {
                  const rect = moreBtnRef.current.getBoundingClientRect();
                  setMorePos({ top: rect.bottom + 4, left: rect.left });
                }
                setMoreOpen((o) => !o);
              }}
              className={`sidebar-row relative z-10 mx-2 flex h-8 items-center rounded-[8px] px-2 text-left
                transition-[width,background-color,color,transform] duration-150 active:scale-[0.98]
                ${moreItems.some((m) => m.key === currentNav) ? "bg-hover-2 group-hover/glide:bg-transparent" : ""}`}
            >
              <span className="flex size-5 shrink-0 items-center justify-center text-ink-2">
                <Icon size={18}>
                  <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                  <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
                </Icon>
              </span>
              <span className="sidebar-copy ml-1.5 min-w-0 flex-1 truncate text-[14px] font-medium text-ink-2">
                More
              </span>
            </button>
          )}
        </GlideGroup>

        {moreOpen &&
          moreItems.length > 0 &&
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

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <div className="sidebar-copy mx-2 mb-1 flex h-7 items-center justify-between px-2">
            <span className="text-[12px] font-medium text-ink-3">{listLabel}</span>
            {recents.length > 4 && (
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter"
                className="w-16 bg-transparent text-right text-[11px] text-ink-3 outline-none placeholder:text-ink-3"
              />
            )}
          </div>

          <GlideGroup>
            {visibleRecents.map((item) => {
              const active = activeId
                ? item.id === activeId
                : item.label === activeTitle;
              const working = item.status?.toLowerCase().includes("working");
              return (
                <button
                  key={item.id}
                  data-row
                  type="button"
                  title={item.label}
                  onClick={() => {
                    selectNav("chats");
                    onPick?.(item.id, item.label, item.prompt);
                  }}
                  className={`sidebar-row relative z-10 mx-2 flex items-center rounded-[8px] text-left transition-[width,background-color,color,transform] duration-150 active:scale-[0.98] ${
                    item.nested ? "h-7 pl-7 pr-2" : "h-10 px-2"
                  } ${
                    active
                      ? "bg-hover-2 group-hover/glide:bg-transparent"
                      : ""
                  }`}
                >
                  {!item.nested && item.teammate !== false && (
                    <span className="relative mr-2 flex size-5 shrink-0 items-center justify-center">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 18 18"
                        aria-hidden
                      >
                        <circle
                          cx="9"
                          cy="9"
                          r="7"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          className={active ? "text-ink" : "text-ink-3"}
                        />
                      </svg>
                      <span
                        className={`absolute right-0 bottom-0 size-1.5 rounded-full ${
                          working ? "bg-accent" : "bg-ink-3"
                        }`}
                      />
                    </span>
                  )}
                  <span className="sidebar-copy min-w-0 flex-1 truncate">
                    <span
                      className={`block truncate text-[14px] font-medium ${
                        item.nested ? "text-[13px]" : ""
                      } ${active ? "text-ink" : "text-ink-2"}`}
                    >
                      {item.label}
                    </span>
                    {!item.nested && item.status && (
                      <span className="block truncate text-[11px] text-ink-3">
                        {item.status}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {query && visibleRecents.length === 0 && (
              <div className="sidebar-copy mx-2 px-2 py-2 text-[12.5px] text-ink-3">
                No matches
              </div>
            )}
            {!query && recents.length === 0 && (
              <div className="sidebar-copy mx-2 px-2 py-2 text-[12.5px] text-ink-3">
                No bots yet
              </div>
            )}
          </GlideGroup>
        </div>

        <div className="sidebar-copy mx-2 mt-3 w-[208px] border-t border-line pt-2">
          <button
            type="button"
            onClick={onFooterClick}
            className="flex h-8 w-full items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-medium text-ink-2 transition-[background-color] duration-150 hover:bg-hover-2 hover:text-ink"
          >
            <Icon size={16}>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
            </Icon>
            {footerLabel}
          </button>
        </div>
      </div>
    </aside>
  );
}
