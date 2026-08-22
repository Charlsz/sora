# Sora

Local-first AI agent runtime and workspace.

Sora is infrastructure for creating, running, and coordinating persistent AI agents.

## Requirements

- [Bun](https://bun.sh) 1.1+

## Quick start

```bash
bun install
bun run sora init
bun run sora agent create klaus --description "Executive assistant"
bun run sora agent run klaus "hello"
```

Default model is `mock:echo` (offline). Configure a remote model per agent:

```bash
bun run sora agent create researcher --model openai:gpt-4o-mini
```

Set `OPENAI_API_KEY` (or provider-specific keys) in the environment.

## Workspace

State lives in `~/.sora` (override with `SORA_HOME`):

```text
~/.sora/
├── config.json
├── database/sora.sqlite
├── agents/<slug>/workspace
└── logs/
```

## Monorepo

| Package             | Role                               |
|---------------------|------------------------------------|
| `@sora/core`        | Runtime, events, SQLite, paths     |
| `@sora/models`      | Model providers                    |
| `@sora/tools`       | Tool interface + builtins          |
| `@sora/memory`      | Conversation + long-term memory    |
| `@sora/computer`    | Computer abstraction + LocalComputer |
| `@sora/permissions` | Central permission gate            |
| `@sora/protocol`    | Envelopes + AgentRouter            |
| `@sora/skills`      | Shared skill format + registry     |
| `@sora/workflows`   | Triggers + workflow engine         |
| `@sora/api`         | Local HTTP + SSE API               |
| `@sora/agents`      | Agents + runner                    |
| `@sora/cli`         | CLI                                |
| `@sora/web`         | Agent workspace UI                 |

See [docs/architecture.md](docs/architecture.md).

## Web UI

```bash
# terminal 1
bun run sora start --yes

# terminal 2
bun run dev:web
```

Open http://localhost:5173 — agents, chat, tools/skills context, live tool events.

## Status

Workspace UI consumes the local API over HTTP + SSE.
