import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  Browser,
  BrowserActionResult,
  BrowserNavigateResult,
  BrowserScreenshotResult,
  BrowserStatus,
} from "./types.ts";

/** Stub used when SORA_BROWSER=off or Playwright Chromium is unavailable. */
export class PlaceholderBrowser implements Browser {
  #url = "about:blank";
  #title = "Sora Browser (placeholder)";

  status(): BrowserStatus {
    return {
      backend: "placeholder",
      open: false,
      url: this.#url,
      title: this.#title,
      headed: false,
    };
  }

  async navigate(url: string): Promise<BrowserNavigateResult> {
    this.#url = url;
    this.#title = url;
    return {
      url,
      title: this.#title,
      ok: false,
      message:
        "Browser is offline (placeholder). Set SORA_BROWSER=on and run: bunx playwright install chromium",
    };
  }

  async content(): Promise<string> {
    return `<!-- placeholder browser @ ${this.#url} -->`;
  }

  async screenshot(): Promise<BrowserScreenshotResult> {
    return {
      ok: false,
      message: "Browser placeholder cannot take screenshots",
      width: 0,
      height: 0,
    };
  }

  async click(selector: string): Promise<BrowserActionResult> {
    return {
      ok: false,
      message: `Browser placeholder cannot click ${selector}`,
      url: this.#url,
    };
  }

  async type(selector: string, text: string): Promise<BrowserActionResult> {
    return {
      ok: false,
      message: `Browser placeholder cannot type into ${selector} (${text.length} chars)`,
      url: this.#url,
    };
  }

  async close(): Promise<void> {
    this.#url = "about:blank";
    this.#title = "Sora Browser (placeholder)";
  }
}

export type LocalBrowserOptions = {
  /** Persistent Chromium profile so logins survive restarts. */
  profileDir: string;
  /** Directory for screenshots (agent workspace). */
  workspaceRoot: string;
  headed?: boolean;
};

type PlaywrightModule = typeof import("playwright");
type BrowserContext = import("playwright").BrowserContext;
type Page = import("playwright").Page;

/**
 * Persistent Chromium session via Playwright.
 * Local Playwright browser — no cloud desktop required.
 */
export class LocalBrowser implements Browser {
  readonly profileDir: string;
  readonly workspaceRoot: string;
  readonly headed: boolean;
  #context: BrowserContext | null = null;
  #page: Page | null = null;
  #launchError: string | null = null;

  constructor(options: LocalBrowserOptions) {
    this.profileDir = options.profileDir;
    this.workspaceRoot = options.workspaceRoot;
    this.headed =
      options.headed ??
      (process.env.SORA_BROWSER_HEADED === "1" ||
        process.env.SORA_BROWSER_HEADED === "true");
  }

  status(): BrowserStatus {
    return {
      backend: "playwright",
      open: Boolean(this.#page),
      url: this.#page?.url() ?? "about:blank",
      title: "",
      profileDir: this.profileDir,
      headed: this.headed,
    };
  }

  async navigate(url: string): Promise<BrowserNavigateResult> {
    try {
      const page = await this.#ensurePage();
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      const title = await page.title();
      const finalUrl = page.url();
      const ok = Boolean(response?.ok() ?? true);
      return {
        url: finalUrl,
        title,
        ok,
        message: ok
          ? `Opened ${finalUrl}`
          : `Navigated to ${finalUrl} (HTTP ${response?.status() ?? "?"})`,
      };
    } catch (error) {
      return {
        url,
        title: "",
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async content(): Promise<string> {
    const page = await this.#ensurePage();
    return page.content();
  }

  async screenshot(options?: {
    path?: string;
    fullPage?: boolean;
  }): Promise<BrowserScreenshotResult> {
    try {
      const page = await this.#ensurePage();
      const buffer = await page.screenshot({
        fullPage: options?.fullPage ?? false,
        type: "png",
      });
      let relative: string | undefined;
      if (options?.path) {
        const safe = options.path.replace(/^[/\\]+/, "");
        const abs = join(this.workspaceRoot, safe);
        mkdirSync(dirname(abs), { recursive: true });
        await Bun.write(abs, buffer);
        relative = safe;
      }
      const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
      return {
        ok: true,
        message: relative ? `Screenshot saved to ${relative}` : "Screenshot captured",
        path: relative,
        base64: Buffer.from(buffer).toString("base64"),
        width: viewport.width,
        height: viewport.height,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        width: 0,
        height: 0,
      };
    }
  }

  async click(selector: string): Promise<BrowserActionResult> {
    try {
      const page = await this.#ensurePage();
      await page.click(selector, { timeout: 15_000 });
      return {
        ok: true,
        message: `Clicked ${selector}`,
        url: page.url(),
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async type(
    selector: string,
    text: string,
    options?: { clear?: boolean },
  ): Promise<BrowserActionResult> {
    try {
      const page = await this.#ensurePage();
      if (options?.clear !== false) {
        await page.fill(selector, text, { timeout: 15_000 });
      } else {
        await page.click(selector, { timeout: 15_000 });
        await page.keyboard.type(text);
      }
      return {
        ok: true,
        message: `Typed ${text.length} chars into ${selector}`,
        url: page.url(),
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async close(): Promise<void> {
    const context = this.#context;
    this.#page = null;
    this.#context = null;
    if (context) {
      await context.close().catch(() => {});
    }
  }

  async #ensurePage(): Promise<Page> {
    if (this.#page) return this.#page;
    if (this.#launchError) {
      throw new Error(this.#launchError);
    }

    mkdirSync(this.profileDir, { recursive: true });
    mkdirSync(this.workspaceRoot, { recursive: true });

    let playwright: PlaywrightModule;
    try {
      playwright = await import("playwright");
    } catch {
      this.#launchError =
        'Playwright is not installed. Run: bun add playwright && bunx playwright install chromium';
      throw new Error(this.#launchError);
    }

    try {
      this.#context = await playwright.chromium.launchPersistentContext(
        this.profileDir,
        {
          headless: !this.headed,
          viewport: { width: 1280, height: 720 },
          args: ["--disable-dev-shm-usage"],
        },
      );
      this.#page = this.#context.pages()[0] ?? (await this.#context.newPage());
      return this.#page;
    } catch (error) {
      this.#launchError =
        error instanceof Error
          ? `${error.message}. Hint: bunx playwright install chromium`
          : String(error);
      throw new Error(this.#launchError);
    }
  }
}

/** Prefer Playwright; fall back to placeholder when disabled. */
export function createBrowser(options: LocalBrowserOptions): Browser {
  const mode = (process.env.SORA_BROWSER ?? "on").toLowerCase();
  if (mode === "off" || mode === "0" || mode === "false" || mode === "placeholder") {
    return new PlaceholderBrowser();
  }
  return new LocalBrowser(options);
}
