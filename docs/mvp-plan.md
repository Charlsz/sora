# Sora MVP Plan — Open-source Grok Bot alternative

## Product thesis

Sora is a **local-first, Bun-native, BYO-LLM** multi-agent workspace: specialized agents, computers, skills, routines, and human approvals — without Cursor Ultra / SuperGrok lock-in.

| Grok Bot | Sora MVP |
|---|---|
| Cloud VM + shared computer | Local FS/terminal + **Playwright browser per agent** |
| Bundled Grok | **BYO** OpenAI / OpenRouter / Ollama |
| Hosted connectors | **Link your accounts** via plugins (Composio + native GitHub) |
| Closed desktop apps | Local API + web UI (desktop shell later) |

## Modular architecture

```text
apps/web          → UI client only (HTTP + SSE)
cli               → operator client
packages/api      → HTTP/SSE boundary
packages/agents   → orchestration (runner, delegation)
packages/plugins  → connector SPI + built-in connectors   ← NEW
packages/tools    → tool interface + builtins
packages/computer → LocalComputer / browser
packages/permissions → PermissionGate
packages/workflows → routines engine
packages/skills   → shared skills
packages/models   → providers
packages/memory   → conversations + memory
packages/core     → paths, config, secrets, events
packages/protocol → routing helpers
```

**Rules**

- UI never imports tools/computer/permissions internals.
- Plugins only contribute `Tool[]` + connection metadata; they never bypass `PermissionGate`.
- Secrets live in `~/.sora/secrets.json` (mode 0600); APIs return **configured flags / masks only**.
- New connectors = one file under `packages/plugins/src/builtins/` + one registry line.

## Trusted external tools (MVP)

1. **Composio** (SOC2 / ISO 27001) — same stack Grok Build docs use for GitHub/Slack/Gmail OAuth. User pastes project API key once; OAuth redirect links apps.
2. **Native GitHub** — Personal Access Token for users who refuse a broker (zero third-party).
3. Later (post-MVP): Slack/Gmail native OAuth, optional Cua desktop, optional Box/VPS.

## Security & privacy

- No secrets in SSE payloads, logs, or UI JSON.
- Connector actions use PermissionGate (`http.request` / future `connector.*`).
- Workspace FS stay agent-scoped; browser profiles stay per-agent.
- Document data residency: everything under `~/.sora` unless the user chooses Composio (their OAuth tokens on Composio’s side).

## MVP checklist

- [x] Runtime, agents, delegation, skills, workflows engine
- [x] Permissions + interactive ask UI
- [x] BYO LLM onboarding
- [x] Local browser computer + panel
- [ ] Modular `@sora/plugins` package
- [ ] Composio + GitHub connectors (link account → tools)
- [ ] Plugins marketplace UI
- [ ] Routines create/list/run in UI
- [ ] Agent create onboarding in UI
- [ ] Architecture doc updated

## Post-MVP

Desktop shell (Bun), teach/record skill, richer triggers, optional Cua/Box adapters.
