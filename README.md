# Sora

Sora is an open-source agent workspace that runs on your machine. You bring your own models, keep your data local, and decide what each agent is allowed to do. It is built as a practical alternative to closed, always-on agent bots: same general idea (chat, tools, routines, plugins), but the runtime, history, and secrets stay under your control.

## Purpose

Most agent products assume a vendor cloud, a fixed model, and opaque permissions. Sora flips that. The goal is a desktop-grade agent environment that feels complete for daily work on Windows and macOS, stays honest about what is local vs optional cloud, and stays extensible through standard tools (MCP, OpenAPI, connectors) without locking you in.

## Vision

Sora should be the place where you run specialized agents (coding, research, ops, personal assistant) with:

- **Local-first by default.** Conversations, memory, agent configs, and workspace files live in a normal folder on disk.
- **Real tools, real gates.** File, terminal, browser, and HTTP access go through an approval flow you can see in the UI.
- **Routines that keep running.** Cron and webhooks trigger agents even when the chat window is closed, as long as the local API is up.
- **Open extension.** MCP servers, OpenAPI specs, Composio, Pipedream, and curated prompts (botdirectory.ai) plug in without forking core code.
- **Optional cloud when you want it.** Browser automation uses local Playwright when installed. Terminal sandboxes (e.g. E2B) are opt-in, not required.

Mobile and fully managed cloud sandboxes are out of scope for now. The focus is a solid desktop experience first.

## How it works

1. **Runtime.** A Bun process hosts a small HTTP API on `127.0.0.1:7420` (by default). All state is under `~/.sora` (or `SORA_HOME`).
2. **Desktop app.** Tauri wraps the web UI and starts the runtime sidecar. You get one window: chat, agents, routines, plugins, settings.
3. **Agents.** Each agent has its own workspace, optional browser profile, model choice, tools, and skills. Runs go through a tool loop with streaming replies over Server-Sent Events.
4. **Permissions.** Sensitive actions ask in the UI (or auto-approve in headless mode with `--yes`). Nothing silently exfiltrates data.
5. **Plugins.** Connectors register tools dynamically (GitHub, MCP, OpenAPI imports, etc.). Reload picks up new tools without restarting the whole stack.
6. **Routines (workflows).** Scheduled jobs, manual runs, and inbound webhooks call the same agent runner. Recorded demonstrations can replay tool steps without calling the model again.

Offline demos work out of the box with the built-in `mock:echo` provider until you connect a real model in **Settings**.

## Model providers

Sora is **bring-your-own-model**. Every agent uses a `provider:model` string (for example `openrouter:anthropic/claude-sonnet-4` or `ollama:llama3.2`). Configure keys in **Settings → Models & providers**; they are stored in `~/.sora/secrets.json` and never returned by the API.

| Provider | Typical use | Env var (optional) |
|----------|-------------|-------------------|
| **Mock** | Offline tests, no key | — |
| **Ollama** | Local, private models | `OLLAMA_HOST` |
| **OpenAI** | GPT-4o, o-series | `OPENAI_API_KEY` or `SORA_API_KEY` |
| **Anthropic** | Claude via OpenRouter or custom gateway | `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` |
| **Google** | Gemini (OpenAI-compatible endpoint) | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| **xAI** | Grok models | `XAI_API_KEY` |
| **Groq** | Fast Llama / Mixtral inference | `GROQ_API_KEY` |
| **Together** | Open models on Together AI | `TOGETHER_API_KEY` |
| **Azure OpenAI** | Your deployment (set base URL) | `AZURE_OPENAI_API_KEY` |
| **OpenRouter** | One key for many vendors | `OPENROUTER_API_KEY` |

The Settings UI includes a **model picker** with curated defaults per provider. You can always type a custom model id. **Azure** and **Anthropic** gateways support a custom **base URL** field.

Connect a model in **Settings** (e.g. `openai:gpt-4o-mini`) or set `OPENAI_API_KEY`. Until then, `mock:echo` works for local testing.

## Architecture

At a high level, everything funnels through the local API:

```
┌─────────────┐     HTTP/SSE      ┌──────────────────┐
│  Web UI     │ ◄──────────────► │  API server      │
│  (Tauri)    │                  │  (Bun)           │
└─────────────┘                  └────────┬─────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
             Agent runner          Workflow engine        Plugin registry
                    │                     │                     │
        ┌───────────┼───────────┐         │              MCP, OpenAPI,
        ▼           ▼           ▼         │              Composio, …
   Model providers  Tools    Computer     │
   (BYO API keys)           (fs/term/     │
                            browser)      │
                    └──────────► same executor ◄──────────┘
```

**Agent runner** resolves the model, streams tokens, executes tools, writes conversation rows to SQLite, and reads long-term memory for context.

**Computer** is the per-agent execution surface: workspace filesystem, shell, and optional Chromium via Playwright.

**Workflow engine** polls cron expressions and serves webhook paths like `/api/hooks/{your-path}`. It never bypasses the runner or permission layer.

**Event bus** pushes run progress (tokens, tool start/finish, permission prompts) to the UI over `/api/events`.

Data stays in SQLite plus plain JSON config files. Secrets (API keys) are stored separately and never returned verbatim by the API.

## Quick start

Requirements: [Bun](https://bun.sh), Rust (for Tauri desktop builds).

```bash
bun install
bun run sora init
bun run desktop
```

CLI-only API (for development or custom frontends):

```bash
bun run sora start
# UI dev server (optional, if not using Tauri)
bun run dev:web
```

Connect a model in **Settings** (e.g. `openai:gpt-4o-mini`) or set `OPENAI_API_KEY`. Until then, `mock:echo` works for local testing.

## Desktop builds

Production installers (Windows NSIS/MSI, macOS app/dmg):

```bash
bun run desktop:build
```

CI builds Windows and macOS on push and pull requests. Tag `v*` to draft a GitHub release. macOS notarization is optional via `APPLE_*` repository secrets. Linux desktop installers are deferred until Win/Mac are solid; for always-on on a Linux VPS use the CLI (see [docs/always-on.md](docs/always-on.md)).

## Common tasks

| Task | How |
|------|-----|
| Create an agent | UI **Agents** panel or `sora agent create` |
| Run headless with auto-approve | `bun run sora start --yes` |
| Trigger a webhook routine | `POST http://127.0.0.1:7420/api/hooks/{path}` |
| Add MCP tools | **Plugins** → MCP, or edit `~/.sora/mcp.json` |
| Import a REST API | Add an OpenAPI spec in `~/.sora/openapi.json` |
| Enable browser tools | **Computer** panel → Install Chromium, or `bunx playwright install chromium` |
| Record a routine from chat | Chat header **Save as routine** (after tool steps), or `POST /api/workflows/record` |
| Keep routines running 24/7 | See [docs/always-on.md](docs/always-on.md) (Task Scheduler, launchd, systemd) |

## Configuration

| Path | Role |
|------|------|
| `~/.sora/config.json` | Default model, browser on/off, optional sandbox |
| `~/.sora/secrets.json` | Provider and plugin API keys |
| `~/.sora/mcp.json` | MCP server definitions |
| `~/.sora/openapi.json` | Imported OpenAPI specs |
| `~/.sora/database/sora.sqlite` | Agents, chats, memory, routines |

Override the home directory with `SORA_HOME`.

## Development

```bash
bun test              # unit and integration tests
bun run typecheck     # TypeScript
bun run sora --help   # CLI reference
```

## License

See [LICENSE](LICENSE) in this repository.
