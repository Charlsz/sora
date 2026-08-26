# Research notes (Grok Bot · Rakazo · OpenMausBot)

Audit date: 2026-08-25. Goal: ready Win/Mac desktop v1, not a clone of any one repo.

## Sources

- [Grok Bot](https://x.ai/bot) + [skills/routines docs](https://docs.x.ai/grok-bot/skills-routines-and-automations)
- [elie222/rakazo](https://github.com/elie222/rakazo) — self-hosted teammates, sandboxes, Postgres
- [milind-soni/OpenMausBot](https://github.com/milind-soni/OpenMausBot) — messaging UI over Claude/Codex/Grok CLIs + Box

## What we audited in Sora (pre-fix)

Critical packaged-desktop blockers found and fixed in the same effort:

1. Tauri UI could not reach `/api` (relative URLs) → absolute `127.0.0.1:7420` in desktop shell
2. CORS missing `PATCH`
3. Workflow enable/delete only in store/CLI → HTTP + UI
4. Onboarding left agents on `mock:echo`
5. PromptBar model switch was display-only
6. Sidebar routine click ran chat instead of `runWorkflow`
7. Webhook URLs used Vite origin
8. Permission asks could hang forever
9. `cargo-xwin` hardcoded in desktop scripts

## Adoption decisions

| Idea | From | Adopt? | Why |
|------|------|--------|-----|
| Permission timeout + session allow | OpenMausBot | **Yes** | Small, high trust win |
| Messaging-style agent roster | OMB / Grok | Partial (already) | Keep improving UX, not rebuild |
| Write-only secrets | OMB / Rakazo | Already | Keep |
| Dedicated webhook receiver port | OMB | **No (v1)** | Same-host `/api/hooks` is enough; document always-on |
| Claude/Codex CLI drivers | OMB | **No** | Different product; Sora is API/BYO model |
| Full cloud GUI desktop | Rakazo / OMB Box | **No (v1)** | Cost/size; we ship E2B code sandbox |
| Postgres + Graphile worker | Rakazo | **No** | Desktop SQLite is the point |
| Voice / ElevenLabs | OMB | **No (v1)** | Tier C |
| Host computer control (Cua) | OMB | **No** | High risk; local workspace tools suffice |
| Team Markdown import | OMB | Later | Nice; not blocking daily driver |
| Teach-by-demo | Grok / Rakazo | Partial | We have tool-step record/replay |
| Encrypted secrets at rest | Rakazo | Next | After desktop path is stable |

## Why Sora can still be “better” for some users

- Smaller install and mental model than Rakazo self-host
- No dependency on Claude/Codex CLI installs (OMB’s strength and lock-in)
- Explicit sandbox security (fail-closed, scrubbed env) documented
- Win/Mac focus with honest deferrals (no fake Linux green)

## Still open for v1 polish

- Conversation list / switch (not only latest)
- Routine run history UI
- Encrypted `secrets.json`
- Sidecar watchdog + clearer spawn errors
- Playwright bundling in installer
