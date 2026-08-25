# Sora Architecture

## Principles

- **Runtime is the product.** UI and CLI are clients of the runtime.
- **Local-first.** Persistent state lives under `~/.sora` (or `$SORA_HOME`).
- **Model-agnostic.** Agents reference models as `provider:model` strings.
- **Replaceable backends.** Memory, models, tools, computers, and plugins use interfaces.
- **Observable.** Important actions emit events on a central bus.
- **Security-first.** Privileged tools go through `PermissionGate`; secrets never appear in SSE/logs.

## Package boundaries

| Package            | Responsibility                                         |
|--------------------|--------------------------------------------------------|
| `@sora/core`       | Paths, config, SQLite, secrets, event bus, runtime     |
| `@sora/models`     | `ModelProvider` interface and LLM providers            |
| `@sora/tools`      | Tool interface, registry, built-in tools               |
| `@sora/plugins`    | Connector SPI (GitHub, Composio, …) → tools            |
| `@sora/memory`     | Conversation + long-term memory stores                 |
| `@sora/computer`   | Local workspace FS/terminal + Playwright browser       |
| `@sora/permissions`| Permission gate + interactive asks                     |
| `@sora/skills`     | Skill discovery / install                              |
| `@sora/workflows`  | Routines (manual / cron / webhook)                     |
| `@sora/agents`     | Agent store, runner, delegation, service wiring        |
| `@sora/api`        | Local HTTP + SSE                                       |
| `@sora/cli` / web  | Clients                                                |

Agents never import React. Tools never import the CLI/UI. Plugins register tools without touching the runner.

## Data layout

```text
~/.sora/
├── config.json
├── secrets.json          # mode 0600 — API keys / PATs
├── database/
│   └── sora.sqlite
├── skills/
├── agents/
│   └── <slug>/
│       ├── agent.json
│       ├── workspace/
│       ├── browser-profile/   # persistent Chromium profile
│       ├── memory/
│       └── skills/
└── logs/
```

## Model references

```text
mock:echo
openai:gpt-4o-mini
ollama:llama3
openrouter:anthropic/claude-sonnet-4
openrouter:x-ai/grok-2
```

The OpenAI-compatible transport covers OpenAI, OpenRouter, Ollama, and custom base URLs.

## Connectors (plugins)

| Plugin   | Auth                         | Why                                      |
|----------|------------------------------|------------------------------------------|
| GitHub   | PAT (`GITHUB_TOKEN` / secrets) | Direct API — no broker                   |
| Composio | Project API key + OAuth apps | Same broker Grok Build docs recommend    |

```bash
sora provider set github --key ghp_…
sora provider set composio --key ak_…
sora plugin connect composio slack
```

## Security & privacy

- Secrets only in `~/.sora/secrets.json` or env; API status returns masked hints.
- Plugin/tool HTTP calls require `http.request` permission (interactive or `--yes`).
- Browser is local Playwright per agent — no mandatory cloud VM.
- Composio holds third-party OAuth tokens (SOC2/ISO); Sora never stores them.

See `docs/mvp-plan.md` for product positioning and roadmap.

## Decision log

### Bun workspaces

Bun is the runtime and package manager.

### SQLite via `bun:sqlite`

Native local persistence. `MemoryStore` stays swappable.

### Mock model provider

Offline default: `mock:echo`.

### Local browser over Box/CUA

Free, per-agent Chromium. Optional cloud computers stay post-MVP.

### Plugin SPI over hard-coded connectors

New apps register as `SoraPlugin` without changing the runner.
