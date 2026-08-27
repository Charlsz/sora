/** Tintable teammate mark (single-color silhouette). Color via `currentColor`. */
export default function BotMark({
  color,
  size = 28,
  className = "",
  title,
}: {
  color: string;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size, color }}
      title={title}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Horns */}
        <path d="M7.2 11.2C5.1 7.4 3.8 4.2 4.6 2.8c.5-.8 1.7-.5 2.8.6 1.4 1.4 2.4 3.6 3.1 5.8L7.2 11.2z" />
        <path d="M24.8 11.2c2.1-3.8 3.4-7 2.6-8.4-.5-.8-1.7-.5-2.8.6-1.4 1.4-2.4 3.6-3.1 5.8l3.3 2z" />
        {/* Head */}
        <path d="M16 6.5c-5.4 0-9.6 4.5-9.6 10.2 0 6.2 3.8 10.8 9.6 10.8s9.6-4.6 9.6-10.8C25.6 11 21.4 6.5 16 6.5z" />
        {/* Eyes (cutouts via darker inset — reverse with surface via opacity on parent) */}
        <circle cx="12.2" cy="15.2" r="1.55" fill="var(--surface, #fff)" />
        <circle cx="19.8" cy="15.2" r="1.55" fill="var(--surface, #fff)" />
        {/* Small smile notch */}
        <path
          d="M13.2 19.4c.7 1.1 1.7 1.7 2.8 1.7s2.1-.6 2.8-1.7"
          fill="none"
          stroke="var(--surface, #fff)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export const BOT_ACCENT_PRESETS = [
  "#3D8B7A",
  "#5B7CDE",
  "#8B6BC9",
  "#C45C6A",
  "#C48A3A",
  "#4A9B9B",
  "#7A6B9E",
  "#6B8F4E",
  "#B44D8E",
  "#2F6FED",
] as const;

export function normalizeAccentColor(
  value: string | null | undefined,
  fallback: string,
): string {
  const raw = (value ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const [, a, b, c] = raw;
    return `#${a}${a}${b}${b}${c}${c}`.toUpperCase();
  }
  return fallback;
}
