# Getting started

## Requirements

- [Bun](https://bun.sh)
- Rust toolchain (desktop builds only)
- Windows 10+ or macOS (Apple silicon or Intel)

## From source (fastest path)

```bash
bun install
bun run sora init
bun run sora start
```

In another terminal:

```bash
bun run dev:web
```

Open http://127.0.0.1:5173. The Vite proxy forwards `/api` to the runtime on port **7420**.

Or use the desktop shell (starts the sidecar for you):

```bash
bun run desktop
```

## First-run checklist

1. Your name (onboarding).
2. Paste a model API key, then an E2B key.
3. Create your first teammate.
4. Chat, then **Watch** or **Open** the computer.
5. Approve tool prompts as they appear (**Allow once** / **Allow session** / **Deny**).

## Headless / auto-approve

```bash
bun run sora start --yes
```

Only use `--yes` on a machine you trust. See [permissions.md](./permissions.md).

## Next reading

- [desktop.md](./desktop.md): packaged app and sidecar
- [providers.md](./providers.md): model catalog
- [routines.md](./routines.md): local schedules (cron while the app is running)
