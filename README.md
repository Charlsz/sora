# Sora

Local-first open-source agent workspace for Windows and macOS. Bring your own models, keep data under `~/.sora`, approve what agents touch.

**Docs:** [docs/index.md](docs/index.md) (start with [getting started](docs/getting-started.md))

## Quick start

```bash
bun install
bun run sora init
bun run desktop          # or: bun run sora start  +  bun run dev:web
```

Connect a model in **Settings**. Until then, `mock:echo` works offline.

## What you get

- Agents with streaming chat, tools, skills, and multi-agent handoffs
- Permissions (allow once / session / deny) with timeouts
- Routines: cron, webhooks, save-from-chat
- Local computer (files, shell, browser) + optional E2B sandbox
- MCP, OpenAPI, and connector plugins

## Not in v1

Mobile, voice, hosted always-on relay, full cloud GUI desktop, Linux installers. See [docs/overview.md](docs/overview.md).

## Develop

```bash
bun test
bun run sora --help
```

Desktop CI builds Windows and macOS. Tag `v*` for draft GitHub releases.

## License

See [LICENSE](LICENSE).
