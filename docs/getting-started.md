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

Open http://127.0.0.1:5173 — the Vite proxy forwards `/api` to the runtime on port **7420**.

Or use the desktop shell (starts the sidecar for you):

```bash
bun run desktop
```

## First-run checklist

1. Create an agent (onboarding or **Agents**).
2. **Models** — paste a provider key (OpenRouter recommended), set default model, click **Test**.
3. Confirm the agent’s model matches (onboarding applies it; or edit the agent).
4. Optional: Computer panel → **Install Chromium** for browsing.
5. Optional: Computer panel → **Enable E2B sandbox** after adding an E2B key (isolated shell).
6. Send a message. Approve tool prompts as they appear (**Allow once** / **Allow session** / **Deny**).

## Headless / auto-approve

```bash
bun run sora start --yes
```

Only use `--yes` on a machine you trust. See [permissions.md](./permissions.md).

## Next reading

- [desktop.md](./desktop.md) — packaged app issues and sidecar
- [providers.md](./providers.md) — model catalog
- [routines.md](./routines.md) — automation
- [always-on.md](./always-on.md) — keep routines firing overnight
