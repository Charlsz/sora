import bodyMaskUrl from "../assets/bot-mark-body.png";
import eyesMaskUrl from "../assets/bot-mark-eyes.png";

/** Tintable teammate mark from sora.png (body tint + white eye cuts). */
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
  const hex = color.trim() || "#5358AF";
  const mask = (url: string) =>
    ({
      WebkitMaskImage: `url(${url})`,
      maskImage: `url(${url})`,
      WebkitMaskSize: "contain",
      maskSize: "contain",
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      WebkitMaskPosition: "center",
      maskPosition: "center",
      WebkitMaskMode: "alpha",
      maskMode: "alpha",
    }) as const;

  return (
    <span
      key={hex}
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      title={title}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      <span
        className="absolute inset-0"
        style={{ backgroundColor: hex, ...mask(bodyMaskUrl) }}
      />
      <span
        className="absolute inset-0"
        style={{ backgroundColor: "#ffffff", ...mask(eyesMaskUrl) }}
      />
    </span>
  );
}

export const BOT_ACCENT_PRESETS = [
  "#5358AF",
  "#3D8B7A",
  "#5B7CDE",
  "#8B6BC9",
  "#C45C6A",
  "#C48A3A",
  "#4A9B9B",
  "#7A6B9E",
  "#6B8F4E",
  "#B44D8E",
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
