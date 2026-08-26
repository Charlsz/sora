import type {
  Browser,
  BrowserActionResult,
  BrowserNavigateResult,
  BrowserScreenshotResult,
  BrowserStatus,
} from "./types.ts";

export type DesktopGui = {
  open: (fileOrUrl: string) => Promise<void>;
  write: (text: string) => Promise<void>;
  press: (key: string | string[]) => Promise<void>;
  leftClick: (x?: number, y?: number) => Promise<void>;
  screenshot: () => Promise<Uint8Array>;
  keepAlive?: () => Promise<void>;
  /** Fetch page HTML via the sandbox shell (has internet). */
  fetchText?: (url: string) => Promise<string>;
};

/**
 * Drive the cloud desktop GUI (E2B) so browser_* tools hit the same VM
 * the user watches / takes control of — not a separate host Playwright window.
 */
export class DesktopBrowser implements Browser {
  #gui: DesktopGui;
  #url = "about:blank";
  #title = "Desktop browser";
  #open = false;

  constructor(gui: DesktopGui) {
    this.#gui = gui;
  }

  status(): BrowserStatus {
    return {
      backend: "remote-desktop",
      open: this.#open,
      url: this.#url,
      title: this.#title,
      headed: true,
    };
  }

  async navigate(url: string): Promise<BrowserNavigateResult> {
    const href = url.trim();
    if (!href) {
      return { url: this.#url, title: this.#title, ok: false, message: "url required" };
    }
    await this.#gui.keepAlive?.().catch(() => {});
    await this.#gui.open(href);
    this.#url = href;
    this.#title = href;
    this.#open = true;
    return {
      url: href,
      title: this.#title,
      ok: true,
      message: "Opened in the teammate’s cloud desktop browser (visible on their screen).",
    };
  }

  async content(): Promise<string> {
    if (this.#gui.fetchText && this.#url && this.#url !== "about:blank") {
      try {
        const html = await this.#gui.fetchText(this.#url);
        return html.slice(0, 80_000);
      } catch (err) {
        return `<!-- fetch failed: ${err instanceof Error ? err.message : String(err)} -->`;
      }
    }
    return `<!-- desktop browser @ ${this.#url}; use http_request for raw HTML if needed -->`;
  }

  async screenshot(): Promise<BrowserScreenshotResult> {
    await this.#gui.keepAlive?.().catch(() => {});
    const bytes = await this.#gui.screenshot();
    const base64 = Buffer.from(bytes).toString("base64");
    return {
      ok: true,
      message: "Desktop screenshot",
      base64,
      width: 1280,
      height: 720,
    };
  }

  async click(selector: string): Promise<BrowserActionResult> {
    // CSS selectors aren’t available on the VNC desktop; prefer Open for precise UI.
    const coord = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(selector);
    if (coord) {
      await this.#gui.leftClick(Number(coord[1]), Number(coord[2]));
      return {
        ok: true,
        message: `Clicked ${coord[1]},${coord[2]} on the desktop`,
        url: this.#url,
      };
    }
    return {
      ok: false,
      message:
        `Desktop click needs "x,y" coordinates (got “${selector}”). ` +
        "Ask the user to Open the screen for precise clicks, or navigate and use keyboard tools.",
      url: this.#url,
    };
  }

  async type(
    selector: string,
    text: string,
    options?: { clear?: boolean },
  ): Promise<BrowserActionResult> {
    await this.#gui.keepAlive?.().catch(() => {});
    if (options?.clear) {
      await this.#gui.press(["ctrl", "a"]);
      await this.#gui.press("backspace");
    }
    // Focus is whatever is active on the desktop after navigate/Open.
    void selector;
    await this.#gui.write(text);
    return {
      ok: true,
      message: `Typed ${text.length} characters on the desktop`,
      url: this.#url,
    };
  }

  async close(): Promise<void> {
    this.#open = false;
    this.#url = "about:blank";
    this.#title = "Desktop browser";
  }
}
