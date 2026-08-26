# Routines

Routines are workflows: an agent + task (or recorded tool steps) + trigger.

## Triggers

| Type | How |
|------|-----|
| Manual | UI **Run** or `POST /api/workflows/:slug/run` |
| Cron | 5-field expression; fires while API is up |
| Webhook | `POST http://127.0.0.1:7420/api/hooks/<path>` |

Optional header: `x-sora-webhook-secret`.

## UI

- Create with cron presets or webhook path (copy URL uses the **runtime** origin, not Vite)
- Pause / Resume / Delete
- **Save as routine** from a chat that used tools (replays demonstrated steps without the LLM)

## Always-on

Cron and webhooks only fire while `sora start` / the desktop sidecar is running. See [always-on.md](./always-on.md).

## Limits (honest)

- Event triggers (Slack/GitHub push → routine) are reserved in the schema but not wired yet. Use webhooks as the external entry point.
