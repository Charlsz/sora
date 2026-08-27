import defaultWallpaperUrl from "./assets/wallpaper-default.jpg";

const WALLPAPER_KEY = "sora.wallpaper";
const THEME_KEY = "sora.theme";
const LEFT_PANEL_KEY = "sora.leftPanel";
const RIGHT_PANEL_KEY = "sora.rightPanel";
/** User cleared wallpaper; do not fall back to the bundled default. */
const WALLPAPER_CLEARED = "none";

export const DEFAULT_WALLPAPER_URL = defaultWallpaperUrl;

export type ThemeMode = "light" | "dark" | "auto";

export type AppearanceState = {
  wallpaper: string | null;
  theme: ThemeMode;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
};

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === "1" || v === "true";
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
}

export function loadAppearance(): AppearanceState {
  let wallpaper: string | null = DEFAULT_WALLPAPER_URL;
  let theme: ThemeMode = "auto";
  try {
    const stored = localStorage.getItem(WALLPAPER_KEY);
    if (stored === WALLPAPER_CLEARED) wallpaper = null;
    else if (stored && stored.startsWith("data:image/")) wallpaper = stored;
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark" || t === "auto") theme = t;
  } catch {
    // ignore
  }
  return {
    wallpaper,
    theme,
    leftPanelOpen: readBool(LEFT_PANEL_KEY, true),
    rightPanelOpen: readBool(RIGHT_PANEL_KEY, true),
  };
}

export function saveWallpaper(dataUrl: string | null): void {
  try {
    if (!dataUrl) localStorage.setItem(WALLPAPER_KEY, WALLPAPER_CLEARED);
    else localStorage.setItem(WALLPAPER_KEY, dataUrl);
  } catch {
    throw new Error(
      "Couldn’t save that image locally (too large or storage blocked).",
    );
  }
}

export function restoreDefaultWallpaper(): void {
  try {
    localStorage.removeItem(WALLPAPER_KEY);
  } catch {
    // ignore
  }
}

export function saveTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}

export function saveLeftPanelOpen(open: boolean): void {
  writeBool(LEFT_PANEL_KEY, open);
}

export function saveRightPanelOpen(open: boolean): void {
  writeBool(RIGHT_PANEL_KEY, open);
}

/** Average luminance 0 to 1 from an image URL or data URL. */
export function measureImageLuminance(src: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve(0.5);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let sum = 0;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3]! / 255;
          if (a < 0.4) continue;
          const r = data[i]! / 255;
          const g = data[i + 1]! / 255;
          const b = data[i + 2]! / 255;
          sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
          n++;
        }
        resolve(n ? sum / n : 0.5);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Couldn’t read image"));
    img.src = src;
  });
}

export function applyDocumentTheme(
  theme: ThemeMode,
  wallpaperLuminance: number | null,
): "light" | "dark" {
  let resolved: "light" | "dark" = "light";
  if (theme === "light") resolved = "light";
  else if (theme === "dark") resolved = "dark";
  else if (wallpaperLuminance != null) {
    resolved = wallpaperLuminance < 0.45 ? "dark" : "light";
  } else if (typeof window !== "undefined" && window.matchMedia) {
    resolved = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  document.documentElement.dataset.theme = resolved;
  return resolved;
}

/** Resize / compress an image file to a data URL suitable for localStorage. */
export function fileToWallpaperDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Pick an image file"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn’t read file"));
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      const img = new Image();
      img.onload = () => {
        const maxEdge = 1920;
        let { width, height } = img;
        const scale = Math.min(1, maxEdge / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };
      img.onerror = () => reject(new Error("Couldn’t decode image"));
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });
}
