# Plugins

| Plugin | Role |
|--------|------|
| MCP | stdio or HTTP tool servers (`~/.sora/mcp.json`) |
| OpenAPI | Import REST specs as tools |
| GitHub | When a GitHub token is configured |
| Composio / Pipedream | Optional connector catalogs |
| botdirectory | Curated bot prompts (search/import/publish) |

UI: **Plugins**. Reload picks up new tools without restarting the whole stack.

Credentials are write-only through the API (never returned after save).
