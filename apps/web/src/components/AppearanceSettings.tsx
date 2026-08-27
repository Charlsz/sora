import { useRef, useState } from "react";
import {
  fileToWallpaperDataUrl,
  type ThemeMode,
} from "../appearance";

export default function AppearanceSettings({
  wallpaper,
  theme,
  onWallpaper,
  onTheme,
}: {
  wallpaper: string | null;
  theme: ThemeMode;
  onWallpaper: (dataUrl: string | null) => void | Promise<void>;
  onTheme: (theme: ThemeMode) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await fileToWallpaperDataUrl(file);
      await onWallpaper(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="rounded-card bg-surface p-3 shadow-card">
      <h3 className="text-[13px] font-semibold text-ink">Appearance</h3>
      <p className="mt-0.5 text-[12px] text-ink-3">
        Personal wallpaper. Dark images switch the UI to dark; light images
        switch to light (when theme is Auto).
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface disabled:opacity-50"
        >
          {busy ? "Loading…" : wallpaper ? "Change wallpaper" : "Add wallpaper"}
        </button>
        {wallpaper && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onWallpaper(null)}
            className="rounded-control bg-field px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-hover disabled:opacity-50"
          >
            Remove
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {wallpaper && (
        <div
          className="mt-3 h-24 overflow-hidden rounded-[10px] border border-line bg-cover bg-center"
          style={{ backgroundImage: `url(${wallpaper})` }}
          aria-hidden
        />
      )}

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-ink-2">Theme</span>
        <select
          value={theme}
          onChange={(e) => onTheme(e.target.value as ThemeMode)}
          className="h-9 rounded-control border border-line bg-field px-2.5 text-[13px] text-ink outline-none focus:border-line-strong"
        >
          <option value="auto">Auto (from wallpaper)</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>

      {error && <p className="mt-2 text-[12px] text-red">{error}</p>}
    </section>
  );
}
