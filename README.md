# Sora

**AI teammates with a cloud computer.** Bring your own model subscription (OpenAI, Claude, Gemini, Grok, OpenRouter). No Sora account — you pay your providers directly.

**Docs:** [docs/index.md](docs/index.md) · [overview](docs/overview.md)

## Quick start

```bash
bun install
bun run sora init
bun run desktop
```

Onboarding: **your name → AI key → cloud sandbox key → first teammate.**

## What you get

- Teammates you message like coworkers
- Each runs in a **cloud sandbox VM** (browser, files, terminal, desktop)
- **Watch** / **Open** the computer — sign into tools, approve when needed
- Routines, multi-teammate handoffs, Composio connectors
- Keys stay on your machine (`~/.sora`)

## Develop

```bash
bun test
bun run desktop:package   # Win/Mac installers
```

Tag `v*` for draft GitHub releases.

## License

See [LICENSE](LICENSE).
