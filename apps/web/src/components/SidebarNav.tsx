import { type CSSProperties, type ReactNode } from "react";
import BotMark from "./BotMark";

export type SidebarRecent = {
  id: string;
  label: string;
  role?: string;
  activity?: string;
  color?: string;
};

type SidebarNavProps = {
  displayName?: string | null;
  activeId?: string | null;
  className?: string;
  fill?: boolean;
  width?: number;
  onNewTeammate?: () => void;
  onPick?: (id: string, label: string) => void;
  activeNav?: string;
  onNavigate?: (key: string) => void;
  onPlugins?: () => void;
  onSettings?: () => void;
  teammates?: SidebarRecent[];
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

const btnPress =
  "cursor-pointer transition-transform duration-100 active:scale-[0.96]";

export default function SidebarNav({
  displayName,
  activeId,
  className = "",
  fill = false,
  width = 260,
  onNewTeammate,
  onPick,
  activeNav,
  onNavigate,
  onPlugins,
  onSettings,
  teammates = [],
}: SidebarNavProps) {
  const selectNav = (key: string) => {
    onNavigate?.(key);
  };

  const initials = (displayName || "You")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside
      aria-label="Teammates"
      className={`relative flex shrink-0 flex-col overflow-hidden border-r border-line bg-panel/80 ${fill ? "h-full" : "h-[600px]"} ${className}`}
      style={{ width } as CSSProperties}
    >
      <div className="flex min-h-0 w-full flex-1 flex-col py-2">
        <div className="mx-2 mb-2 flex items-center justify-end">
          <button
            type="button"
            aria-label="New teammate"
            onClick={() => onNewTeammate?.()}
            className={`flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-field text-ink-2 ${btnPress}`}
          >
            <Icon size={16}>
              <path d="M12 5v14M5 12h14" />
            </Icon>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-1.5">
          <div className="flex flex-col gap-0.5">
            {teammates.map((t) => {
              const active = activeId === t.id;
              const color = t.color ?? teammateColor(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    selectNav("chats");
                    onPick?.(t.id, t.label);
                  }}
                  className={`flex w-full items-start gap-2.5 rounded-[12px] px-2.5 py-2.5 text-left ${btnPress} ${
                    active ? "bg-field" : ""
                  }`}
                >
                  <BotMark color={color} size={30} className="mt-0.5" />
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
            {teammates.length === 0 && (
              <p className="px-3 py-3 text-[12.5px] text-ink-3">
                No teammates yet. Tap + to create one
              </p>
            )}
          </div>
        </div>

        <div className="mx-2 mt-2 flex flex-col gap-0.5 border-t border-line pt-2">
          <button
            type="button"
            onClick={() => {
              onPlugins?.();
              onNavigate?.("plugins");
            }}
            className={`flex h-11 w-full items-center gap-2.5 rounded-[10px] px-2 text-left ${btnPress} ${
              activeNav === "plugins" ? "bg-field" : ""
            }`}
          >
            <span className="flex size-8 shrink-0 items-center justify-center text-ink-2">
              <Icon size={18}>
                <path d="M12 22v-5" />
                <path d="M9 8V2" />
                <path d="M15 8V2" />
                <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
              </Icon>
            </span>
            <span className="text-[13px] font-medium text-ink">Plugin</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onSettings?.();
              onNavigate?.("settings");
            }}
            className={`flex h-11 w-full items-center gap-2.5 rounded-[10px] px-2 text-left ${btnPress} ${
              activeNav === "settings" ? "bg-field" : ""
            }`}
          >
            <span className="flex size-8 shrink-0 items-center justify-center text-ink-2">
              <Icon size={18}>
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </Icon>
            </span>
            <span className="text-[13px] font-medium text-ink">Settings</span>
          </button>
          <div className="flex h-11 items-center gap-2.5 px-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-field text-[11px] font-semibold text-ink-2">
              {initials}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
              {displayName?.trim() || "You"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
