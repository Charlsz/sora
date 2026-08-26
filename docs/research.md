# Research notes (internal)

Audit date: 2026-08-25. Goal: Win/Mac desktop daily driver that feels like a Grok Bot coworker, without cloning a SaaS stack.

## Primary reference

- [Grok Bot](https://x.ai/bot) and official skills/routines docs

## Blockers found and fixed in the desktop readiness pass

1. Tauri UI could not reach `/api` (relative URLs) → absolute `127.0.0.1:7420` in desktop shell  
2. CORS missing `PATCH`  
3. Workflow enable/delete only in store/CLI → HTTP + UI  
4. Onboarding left agents on `mock:echo`  
5. PromptBar model switch was display-only  
6. Sidebar routine click ran chat instead of `runWorkflow`  
7. Webhook URLs used Vite origin  
8. Permission asks could hang forever  
9. `cargo-xwin` hardcoded in desktop scripts  

## Product decisions

| Idea | Adopt? | Why |
|------|--------|-----|
| Permission timeout + session allow | **Yes** | High trust, small surface |
| Messaging-style agent roster | Partial | Improve UX; no rewrite |
| Write-only secrets in API | Already | Keep |
| Dedicated webhook receiver port | **No (v1)** | Same-host `/api/hooks` + always-on docs |
| Drive Claude/Codex CLIs as backends | **No** | Sora is API / BYO model |
| Full cloud GUI desktop in v1 | **No** | Cost/size; ship lean E2B shell + local browser |
| Postgres worker stack | **No** | Desktop SQLite is the point |
| Voice | **No (v1)** | Later |
| Host computer control | Later | High risk; local workspace first |
| Teach-by-demo | Partial | Tool-step record/replay today |
| Encrypted secrets at rest | Next | After desktop path is stable |

## Still open for v1 polish

- Conversation list / switch (not only latest)  
- Routine run history UI  
- Encrypted `secrets.json`  
- Sidecar watchdog + clearer spawn errors  
- Playwright bundling in installer  

Living gap list for users: [parity.md](./parity.md).
