# Overview

Sora is an open-source **agent workspace you run yourself**. Chat with specialized agents, approve what they touch, run routines on a schedule or webhook, and keep conversations, memory, and secrets under `~/.sora`.

## Product promise (v1)

**Windows + macOS desktop daily driver:** create bots, stream chat, use tools (files, terminal, browser, HTTP), connect MCP/OpenAPI plugins, run cron/webhook routines while the local API is up, bring your own models.

Not v1: mobile, voice, hosted always-on relay, full cloud GUI desktop (Box / E2B Desktop), Linux installers.

## How Sora compares

| | Grok Bot | Rakazo | OpenMausBot | **Sora** |
|--|----------|--------|-------------|----------|
| Hosting | Vendor cloud | Self-host Postgres + sandboxes | Local harness + optional Box | **Local Bun + SQLite + Tauri** |
| Models | Fixed | BYO via Pi | Claude/Codex/Grok **CLIs** | BYO OpenAI-compatible APIs |
| Computer | Always-on cloud desktop | Docker / E2B Desktop / Daytona / Box | Box / local / host control | Local + **optional E2B microVM** |
| Approvals | Yes | Yes | Inline broker | UI cards + session allow |
| Routines | Cloud cron + events | Worker + Markdown | Local webhook receiver | Cron + `/api/hooks` |
| Data | Cloud | Your server | `~/.openmausbot` | `~/.sora` |
| Footprint | SaaS | Heavy | Electron + CLI agents | **Smaller desktop stack** |

## Positioning

- **vs Grok:** Same job (teammates + tools + routines). You own keys and data; no free always-on cloud or mobile.
- **vs Rakazo:** Same open alternative idea, leaner runtime (no Postgres/Graphile/mobile required for desktop v1).
- **vs OpenMausBot:** OMB drives installed CLIs (Claude Code, Codex). Sora drives **HTTP model APIs** and a modular tool/MCP layer. We adopted OMB’s permission timeout / session-allow pattern and messaging-style agent roster, not the CLI driver model.

See [research.md](./research.md) for the full audit and adoption decisions.
