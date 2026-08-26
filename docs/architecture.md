# Architecture

```
apps/web          React UI
apps/desktop      Tauri 2 shell + sidecar
cli/              sora CLI (init, start, agents, workflows, …)
packages/
  core            paths, config, secrets, SQLite, events
  api             HTTP + SSE on 127.0.0.1:7420
  agents          store, runner, inbox, delegation
  models          provider catalog + OpenAI-compatible clients
  tools           builtins (fs, terminal, browser, memory, …)
  computer        local FS/shell/browser + optional E2B sandbox
  memory          SQLite conversations + notes
  permissions     policy gate + ask
  plugins         MCP, OpenAPI, Composio, Pipedream, botdirectory
  workflows       cron / webhook / manual + demonstration replay
  skills          disk skill packs
  protocol        routing helpers
```

## Data

| Path | Role |
|------|------|
| `~/.sora/config.json` | Default model, browser, computer |
| `~/.sora/secrets.json` | Provider keys + vault (AES encrypted; machine key in `.encryption-key`) |
| `~/.sora/database/sora.sqlite` | Agents, chats, memory, routines |
| `~/.sora/agents/<slug>/` | Workspace + browser profile |
| `~/.sora/mcp.json` | MCP servers |
| `~/.sora/openapi.json` | Imported OpenAPI specs |

Override home with `SORA_HOME`.

## Runtime loop

1. UI/CLI → `POST /api/agents/:slug/run`
2. Runner resolves model, streams tokens via events
3. Tools call PermissionGate then Computer
4. Messages persist to SQLite; memory notes optional
5. SSE `/api/events` updates the UI

## Design choices (vs heavy alternatives)

- SQLite over Postgres for single-user desktop
- OpenAI-compatible HTTP for models (not CLI subprocess drivers)
- Local browser + optional E2B **code** sandbox (not full cloud desktop by default)
- Fail-closed sandbox (no silent host fallback)
