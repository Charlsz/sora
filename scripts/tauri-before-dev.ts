/**
 * Tauri beforeDevCommand — cwd-independent (runs from src-tauri).
 */
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const child = Bun.spawn(["bun", "--filter", "@sora/web", "dev"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});
process.exit(await child.exited);
