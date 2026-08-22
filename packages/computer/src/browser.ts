import type { Browser, BrowserNavigateResult } from "./types.ts";

/** Phase 2 stub. Real browser automation arrives in Phase 7. */
export class PlaceholderBrowser implements Browser {
  #url = "about:blank";
  #title = "Sora Browser (placeholder)";

  async navigate(url: string): Promise<BrowserNavigateResult> {
    this.#url = url;
    this.#title = url;
    return {
      url,
      title: this.#title,
      ok: false,
      message:
        "Browser computer is a placeholder until Phase 7. Navigation was recorded but not executed.",
    };
  }

  async content(): Promise<string> {
    return `<!-- placeholder browser @ ${this.#url} -->`;
  }
}
