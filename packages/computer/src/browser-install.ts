import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

export type BrowserInstallStatus = {
  playwrightInstalled: boolean;
  chromiumInstalled: boolean;
  message: string;
};

/** Check whether Playwright and Chromium are usable. */
export async function getBrowserInstallStatus(): Promise<BrowserInstallStatus> {
  try {
    await import("playwright");
  } catch {
    return {
      playwrightInstalled: false,
      chromiumInstalled: false,
      message:
        "Playwright is not installed. Run install from Settings or: bunx playwright install chromium",
    };
  }

  try {
    const { chromium } = await import("playwright");
    const execPath = chromium.executablePath();
    if (existsSync(execPath)) {
      return {
        playwrightInstalled: true,
        chromiumInstalled: true,
        message: "Playwright Chromium is ready",
      };
    }
    return {
      playwrightInstalled: true,
      chromiumInstalled: false,
      message: "Chromium browser binaries missing — run install",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      playwrightInstalled: true,
      chromiumInstalled: false,
      message: msg.includes("Executable doesn't exist")
        ? "Chromium browser binaries missing — run install"
        : msg,
    };
  }
}

/** Download Chromium for Playwright (may take a minute). */
export function installPlaywrightChromium(): Promise<{
  ok: boolean;
  output: string;
  error?: string;
}> {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? "bunx.cmd" : "bunx";
    const child = spawn(cmd, ["playwright", "install", "chromium"], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let output = "";
    child.stdout?.on("data", (d) => {
      output += String(d);
    });
    child.stderr?.on("data", (d) => {
      output += String(d);
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        output: output.trim(),
        error: code === 0 ? undefined : `install exited with code ${code}`,
      });
    });
    child.on("error", (err) => {
      resolve({ ok: false, output, error: err.message });
    });
  });
}
