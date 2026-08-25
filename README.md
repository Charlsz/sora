# Sora

Local-first desktop agent workspace. Tauri + Bun. BYO models.

```bash
bun install
bun run sora init
bun run desktop
```

Release installers (NSIS/MSI + macOS app/dmg):

```bash
bun run desktop:build
```

CI builds Windows + macOS on push/PR; draft GitHub releases on `v*` tags. Optional Apple notarization via repo secrets (`APPLE_*`).

CLI: `bun run sora --help` · State: `~/.sora`
