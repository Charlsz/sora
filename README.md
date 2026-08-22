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
| `@sora/agents`      | Agents + runner                    |
| `@sora/cli`         | CLI                                |

See [docs/architecture.md](docs/architecture.md).

## Status

Workflows — manual, cron, and webhook triggers execute through the agent runtime.
