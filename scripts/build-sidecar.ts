/**
 * Build the self-contained Sora API sidecar for Tauri (no system Bun required).
 * Playwright stays external — browser tools use PlaceholderBrowser until installed.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const triple =
  process.env.TAURI_ENV_TARGET_TRIPLE ||
  (process.platform === "win32"
    ? "x86_64-pc-windows-msvc"
    : process.platform === "darwin"
      ? process.arch === "arm64"
        ? "aarch64-apple-darwin"
        : "x86_64-apple-darwin"
      : process.arch === "arm64"
        ? "aarch64-unknown-linux-gnu"
        : "x86_64-unknown-linux-gnu");

const ext = process.platform === "win32" ? ".exe" : "";
const outDir = join("apps", "desktop", "src-tauri", "binaries");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `sora-runtime-${triple}${ext}`);

console.log(`sidecar → ${out}`);

const result = Bun.spawnSync(
  [
    "bun",
    "build",
    "./cli/src/bin.ts",
    "--compile",
    "--minify",
    "--external",
    "playwright",
    "--external",
    "playwright-core",
    "--outfile",
    out,
  ],
  { cwd: join(import.meta.dir, ".."), stdout: "inherit", stderr: "inherit" },
);

if (result.exitCode !== 0) {
  process.exit(result.exitCode ?? 1);
}
