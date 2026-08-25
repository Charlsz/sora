/**
 * Build the self-contained Sora API sidecar for Tauri (no system Bun required).
 * Playwright stays external — browser tools use PlaceholderBrowser until installed.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

function hostTriple(): string {
  if (process.platform === "win32") return "x86_64-pc-windows-msvc";
  if (process.platform === "darwin") {
    return process.arch === "arm64"
      ? "aarch64-apple-darwin"
      : "x86_64-apple-darwin";
  }
  return process.arch === "arm64"
    ? "aarch64-unknown-linux-gnu"
    : "x86_64-unknown-linux-gnu";
}

function resolveTriple(): string {
  const env = process.env.TAURI_ENV_TARGET_TRIPLE?.trim();
  const host = hostTriple();
  if (!env) return host;
  // Ignore mismatched triples (e.g. windows env leaked onto macOS CI).
  const ok =
    (process.platform === "win32" && env.includes("windows")) ||
    (process.platform === "darwin" && env.includes("apple-darwin")) ||
    (process.platform === "linux" && env.includes("linux"));
  return ok ? env : host;
}

const triple = resolveTriple();
const ext = process.platform === "win32" ? ".exe" : "";
const root = join(import.meta.dir, "..");
const outDir = join(root, "apps", "desktop", "src-tauri", "binaries");
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
  { cwd: root, stdout: "inherit", stderr: "inherit" },
);

if (result.exitCode !== 0) {
  process.exit(result.exitCode ?? 1);
}
