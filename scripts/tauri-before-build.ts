/**
 * Tauri beforeBuildCommand entry — cwd-independent (runs from src-tauri).
 */
import { join } from "node:path";

const root = join(import.meta.dir, "..");

function run(cmd: string[], label: string) {
  console.log(`→ ${label}`);
  const result = Bun.spawnSync(cmd, {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  if (result.exitCode !== 0) {
    console.error(`${label} failed (${result.exitCode})`);
    process.exit(result.exitCode ?? 1);
  }
}

run(["bun", "scripts/build-sidecar.ts"], "sidecar");
run(["bun", "run", "build:web"], "web");
