# Testing and v1 readiness

## Automated

```bash
bun test              # unit + API integration (target: all green)
bun run typecheck     # when bun-types resolve in your env
```

Key suites:

| Area | Path |
|------|------|
| Agents / inbox / tools | `packages/agents/src/*.test.ts` |
| API | `packages/api/src/api.test.ts` |
| Computer / sandbox security | `packages/computer/src/**/*.test.ts` |
| Workflows | `packages/workflows/src/*.test.ts` |
| Models | `packages/models/src/models.test.ts` |

Sandbox security tests cover: env scrubbing, fail-closed E2B without key, fake provider sync.

## Manual desktop checklist (must pass before calling v1 “ready”)

### Dev loop

- [ ] `bun run sora init && bun run sora start`
- [ ] `bun run dev:web` → health green, create agent, chat with `mock:echo`
- [ ] Add OpenRouter (or OpenAI) key → Test → agent model updates
- [ ] Tool call → Allow once / Allow session / Deny
- [ ] Leave ask pending 5+ minutes → auto-deny (optional soak)
- [ ] Routines: create, pause, resume, delete, run
- [ ] Webhook: `curl -X POST http://127.0.0.1:7420/api/hooks/<path> -H "content-type: application/json" -d '{}'`
- [ ] Save as routine after tool-using chat
- [ ] Computer: Install Chromium → navigate → screenshot
- [ ] Optional: E2B key → Enable sandbox → terminal tool runs remotely

### Packaged Tauri

- [ ] `bun run desktop:build` on Win or Mac
- [ ] Launch installer/app → **Runtime online**
- [ ] Chat works (proves API base fix)
- [ ] PATCH agent model from PromptBar works (proves CORS PATCH)
- [ ] Quit cleans up or documents shared runtime

### Always-on (optional)

- [ ] Task Scheduler / launchd keeps `sora start --yes` alive
- [ ] Cron fires with laptop closed but process up

## Research regression

After adding Computer / teammate-parity features, require:

1. Tests for the new path (or Fake provider)
2. Security review: do secrets leave the host?
3. Docs page or section updated
4. Explicit “not adopted” note in [research.md](./research.md) if we rejected an idea

## Performance notes

Prefer:

- Idle sandbox TTL over always-on desktop VMs
- Workspace sync skips `node_modules` / large media
- Scrubbed local env (no full `process.env` copy)
- SSE streaming without buffering whole replies in the UI state beyond need
