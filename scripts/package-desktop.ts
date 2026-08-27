/**
 * Local package smoke for Win/Mac installers.
 * Builds sidecar + Tauri bundles and prints where artifacts land.
 *
 * Usage: bun run desktop:package
 * CI tags (v*): .github/workflows/desktop.yml drafts a GitHub Release.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

function run(cmd: string[], label: string) {
  console.log(`\n→ ${label}`);
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
run(["bun", "--filter", "@sora/desktop", "build"], "tauri build");

const targetDir = join(root, "apps", "desktop", "src-tauri", "target");
const candidates = [
  join(targetDir, "release", "bundle"),
  join(targetDir, "x86_64-pc-windows-msvc", "release", "bundle"),
  join(targetDir, "aarch64-apple-darwin", "release", "bundle"),
  join(targetDir, "x86_64-apple-darwin", "release", "bundle"),
];

console.log("\nArtifacts (if present):");
for (const dir of candidates) {
  if (!existsSync(dir)) continue;
  console.log(`  ${dir}`);
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      for (const f of readdirSync(full).slice(0, 20)) {
        console.log(`    ${name}/${f}`);
      }
    } else {
      console.log(`    ${name}`);
    }
  }
}

console.log(`
Smoke checklist (packaged app):
  1. Launch → name
  2. Model API key → E2B key
  3. First teammate
  4. Chat → Watch or Open
  5. Allow once / Allow session / Deny when asked
  6. Hide panel while Open → chat expands (no 380px trap)
  7. Quit → sidecar stops

Release: git tag v0.1.0 && git push origin v0.1.0
  → CI runs bun test, then drafts Win (NSIS/MSI) + Mac (DMG) on GitHub Releases
`);
