# Sora

**Open-source Grok Bot** — AI teammates with a cloud computer. Bring your own model subscription (OpenAI, Grok, OpenRouter). No Sora account. No Grok Bot fee.

**Docs:** [docs/index.md](docs/index.md) · [overview](docs/overview.md)

## Quick start

```bash
bun install
bun run sora init
bun run desktop
```

Onboarding walks you through: **your name → AI key → cloud sandbox key → first bot.**

## What you get

- Teammates you message like coworkers (Sales, Inbox, Ops, …)
- Each bot runs in a **cloud sandbox VM** (browser, files, terminal, desktop)
- **Watch** / **Open desktop** — sign into tools, approve when needed
- Routines, multi-bot handoffs, Composio connectors
- Keys stay on your machine (`~/.sora`); **you pay providers directly**

## vs Grok Bot

| Grok Bot | Sora |
|----------|------|
| Paid subscription | **Free OSS app** |
| Sign in to SpaceXAI | **No Sora login** |
| Bundled models + VM | **BYO API keys + E2B sandbox** |

## Develop

```bash
bun test
bun run desktop:package   # Win/Mac installers
```

Tag `v*` for draft GitHub releases.

## License

See [LICENSE](LICENSE).
