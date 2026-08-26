/** Open a URL in the system browser (Tauri shell when available). */
export async function openExternalUrl(url: string): Promise<void> {
  const href = url.trim();
  if (!href) return;

  try {
    const w = window as Window & {
      __TAURI_INTERNALS__?: unknown;
      __TAURI__?: unknown;
    };
    if (w.__TAURI_INTERNALS__ || w.__TAURI__) {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(href);
      return;
    }
  } catch {
    /* fall through */
  }

  const opened = window.open(href, "_blank", "noopener,noreferrer");
  if (!opened) {
    // Last resort: navigate top-level (rare popup block)
    window.location.assign(href);
  }
}
