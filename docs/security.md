# Security & privacy

Sora is local-first. Your workspace, keys, and browser profiles stay on your machine unless you explicitly call an external API.

## Secrets

| What | Where |
|------|--------|
| LLM keys (OpenAI, OpenRouter, …) | `~/.sora/secrets.json` (mode `0600`) or env |
| GitHub PAT | same file under `providers.github`, or `GITHUB_TOKEN` |
| Composio project key | `providers.composio`, or `COMPOSIO_API_KEY` |

Rules:

- Never log or stream raw secrets (SSE, events, plugin status).
- UI/API only show redacted hints (`abc…xyz` or `from env`).
- Clear credentials with `sora provider clear <id>` or the Plugins / Models UI.

## Permissions

Privileged actions go through `PermissionGate`:

- Filesystem / terminal
- Browser navigate / click / type
- Outbound HTTP for connectors (`http.request`)

Interactive mode (`sora start`) prompts in the web UI. Headless: `sora start --yes` auto-approves (use only on trusted machines).

## Connectors

- **GitHub (native):** PAT stays local; calls go to `api.github.com`.
- **Composio:** Your project API key stays local. App OAuth tokens are stored by Composio (SOC2 / ISO 27001). Sora never receives those tokens—only action results after you link an account.

## Browser

Each agent has a persistent Chromium profile under `~/.sora/agents/<slug>/browser-profile`. Disable with `SORA_BROWSER=off`.

## Network surface

The local API (`:7420` by default) is intended for localhost use with the web UI. Do not expose it to the public internet without an auth layer (post-MVP).
