# Sora Architecture

## Principles

- **Runtime is the product.** UI and CLI are clients of the runtime.
- **Local-first.** Persistent state lives under `~/.sora` (or `$SORA_HOME`).
- **Model-agnostic.** Agents reference models as `provider:model` strings.
- **Replaceable backends.** Memory, models, tools, and computers use interfaces.
- **Observable.** Important actions emit events on a central bus.
- **Security-first.** Privileged tools require explicit permission modes (Phase 2).

## Package boundaries

| Package        | Responsibility                                      |
|----------------|-----------------------------------------------------|
| `@sora/core`   | Paths, config, SQLite bootstrap, event bus, runtime |
| `@sora/models` | `ModelProvider` interface and providers             |
| `@sora/tools`  | Tool interface, registry, built-in tools            |
| `@sora/memory` | Conversation + long-term memory stores              |
| `@sora/agents` | Agent types, store, runner, tool loop               |
| `@sora/cli`    | Local CLI client                                    |

Agents never import React. Tools never import the CLI/UI.

## Data layout

```text
~/.sora/
├── config.json
├── database/
│   └── sora.sqlite
├── agents/
│   └── <slug>/
│       ├── agent.json
│       ├── workspace/
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
```

The `openai-compatible` transport covers OpenAI, OpenRouter, Ollama (OpenAI mode), and custom base URLs.

## Phase roadmap

1. Runtime + agents + models + tools + memory + CLI
2. LocalComputer + permissions + workspace isolation
3. Delegation + agent messaging + routing
4. Skills
5. Workflows
6. UI
7. Browser computer
8. Plugins

## Decision log

### Bun workspaces over pnpm/turbo

Bun is the runtime and package manager. Extra tooling is deferred until needed.

### SQLite via `bun:sqlite`

Native, zero-config local persistence. The `MemoryStore` interface keeps the door open for other backends.

### Mock model provider

Phase 1 must run without cloud credentials. `mock:echo` is the default so CLI demos and tests stay offline-capable.

### Single process runtime

Phase 1 embeds the runtime in the CLI process. A long-lived daemon/API arrives when the UI needs it.
