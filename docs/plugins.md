# Plugins

| Plugin | Role |
|--------|------|
| MCP | stdio or HTTP tool servers (`~/.sora/mcp.json`) |
| OpenAPI | Import REST specs as tools |
| GitHub | When a GitHub token is configured |
| Composio / Pipedream | Optional connector catalogs |
| botdirectory | Curated **setup prompts** — import creates a teammate shell; client sends `setupPrompt` as the first chat message (see [agents-and-chat.md](./agents-and-chat.md)) |
| composio | Connect apps (Gmail, X, Slack, …) via browser login — 3-step setup in Connected apps |

UI: **Plugins**. Reload picks up new tools without restarting the whole stack.

Credentials are write-only through the API (never returned after save).
