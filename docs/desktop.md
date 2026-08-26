# Desktop app (Tauri)

## Architecture

```
┌─────────────────────┐     HTTP/SSE      ┌──────────────────────┐
│  Tauri webview UI   │ ◄───────────────► │  sora-runtime sidecar│
│  (apps/web build)   │  127.0.0.1:7420   │  (Bun CLI start)     │
└─────────────────────┘                   └──────────────────────┘
```

The UI never embeds model keys. All work goes through the local API.

## Critical: API base URL

In **dev** (`bun run desktop` / Vite on `:5173`), the UI uses relative `/api` URLs and Vite proxies to `:7420`.

In **packaged** builds, the UI loads from the Tauri asset protocol. Relative `/api` would miss the sidecar. The client detects Tauri and calls `http://127.0.0.1:7420` instead (`apps/web/src/api.ts`).

If you see “API is offline” in a packaged app:

1. Confirm something listens on `127.0.0.1:7420` (`curl http://127.0.0.1:7420/api/health`).
2. Confirm CORS allows the Tauri origin (`PATCH` included).
3. Override with `VITE_API_BASE=http://127.0.0.1:7420` when building the web UI.

## Scripts

| Command | Use |
|---------|-----|
| `bun run desktop` | Native `tauri dev` (Win/Mac) |
| `bun run desktop:build` | Sidecar + Tauri installer |
| `bun --filter @sora/desktop run build:xwin` | Cross-compile with `cargo-xwin` only when needed |

Do **not** use `cargo-xwin` for day-to-day Win/Mac native builds.

## Sidecar

Built by `scripts/build-sidecar.ts` into `apps/desktop/src-tauri/binaries/sora-runtime-<triple>`.

Tauri `lib.rs` tries: next to the exe → resources → binaries → `bun cli/src/bin.ts` fallback in dev.

## Browser in packaged apps

Playwright Chromium may still need a one-time install. Prefer the Computer panel **Install Chromium** button while Bun is available, or run `bunx playwright install chromium` once on the machine.

## Signing

CI can produce unsigned/ad-hoc builds. macOS notarization needs `APPLE_*` secrets. Windows SmartScreen may warn until code signing is configured.

## Smoke test (packaged)

1. Launch the app → footer shows **Runtime online**.
2. Create agent → set model → Test connection.
3. Chat → tool approval appears → Allow once.
4. Routines → create manual → Run.
5. Quit app → sidecar should stop if it was spawned by the app.
