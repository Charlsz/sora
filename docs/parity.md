# Parity vs Grok Bot

Honest status of Sora as a **local-first Grok Bot–style coworker workspace**. Verified against the current codebase + tests (2026-08-25).

## Verdict

**Core coworker loop works locally today.** You can create agents, switch conversations, chat with streaming, watch the browser Computer, approve actions, run skills, delegate between agents, schedule cron/webhook routines with run history, and isolate the shell via E2B or Docker — with your own models and data under `~/.sora`.

**Still not identical to Grok** for: vendor-hosted always-on Team Computer, live remote desktop takeover in a cloud VM, and zero-ops away mode without keeping *your* runtime up.

## Feature matrix

| Grok Bot user can… | Sora today | Remaining gap |
|--------------------|------------|---------------|
| Chat with specialized bots | **Working** | Polish |
| Switch past conversations | **Working** | Rename/delete UI |
| Give bots a real computer | **Working** — local / E2B / Docker | Full cloud GUI desktop |
| Watch the computer work | **Working** — Watch button (browser frames) | Remote desktop stream |
| Take over the desktop | **No** | Input channel on remote Computer |
| Approve risky actions | **Working** | — |
| Schedule routines + see runs | **Working** | Event triggers (Slack/GitHub) |
| Save a demo as a routine | **Partial** — tool-step replay | Screen recording (optional) |
| Multi-agent handoffs | **Working** | — |
| Skills / connectors | **Working** | More first-party connectors |
| Bring your own model | **Working** | — |
| Encrypt secrets at rest | **Working** when `SORA_ENCRYPTION_KEY` set | OS keychain default |
| Work while laptop is closed | **Partial** — `bun run always-on` / VPS | Hosted relay |

## What shipped in this pass

1. Computer config (`computer.provider`) + docs scrub (Grok-only)  
2. Live **Watch** on Computer panel + `GET …/computer/display`  
3. Conversation switcher in chat header  
4. Routine **run history** API + UI  
5. **Docker** Computer provider (bind-mounted workspace)  
6. **AES-GCM** secrets when `SORA_ENCRYPTION_KEY` is set  
7. Always-on install helper (`bun run always-on`)

## Architecture note

Grok Bot = vendor cloud control plane + cloud Computer.  
Sora = **local control plane** + **pluggable Computer**. Matching the *user journey* does not require matching the SaaS deployment model.

See [computer.md](./computer.md) and [always-on.md](./always-on.md).
