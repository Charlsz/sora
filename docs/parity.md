# Feature status

Honest status of Sora as an **open-source AI teammate workspace** (BYO models + cloud computer). Verified against the codebase (2026-08).

## Positioning

| | Sora |
|--|------|
| Product | AI teammates + cloud computer |
| Account | **No Sora account (for now)** |
| Models | **BYO keys** (OpenRouter / OpenAI / Anthropic / Gemini / xAI / …) |
| Computer | **BYO E2B cloud sandbox VM** |
| App | **Desktop (Win/Mac)** |

## Feature matrix

| You can… | Status | Gap |
|----------|--------|-----|
| Message specialized teammates | **Working** | Polish |
| Bots work in **cloud computer** | **Working** (E2B desktop VM) | Bundled VM (optional later) |
| Watch / take over desktop | **Working** | — |
| Sign into tools on computer | **Working** (Open + Composio) | More connectors |
| Approve risky actions | **Working** | — |
| Multiple bots in parallel | **Working** | Chief-of-staff UX polish |
| Routines (overnight jobs) | **Working** (cron/webhooks) | Demo capture → routine |
| Save workflow from demo | **Partial** (tool-step replay) | Screen recording |
| 24/7 while laptop closed | **Partial** | Hosted control plane |
| Mobile messaging | **No** | Mobile app |

## Honest gaps

1. **One bundled bill** — today E2B + model keys are separate  
2. **Always-on 24/7** — needs hosted runtime or always-on service  
3. **Demo → routine** — watch-once teaching UX not shipped  
4. **Mobile** — not started  

## Architecture

```
Desktop app (chat, settings, no Sora login)
        ↓
   Local API (~/.sora)
        ↓
   Cloud sandbox VM (E2B) ← bot computer
        ↓
   Your model API (BYO keys)
```
