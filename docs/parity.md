# Parity vs Grok Bot

Sora targets **feature parity with Grok Bot** as an **open-source, BYO-subscription** alternative — not a “local-first dev tool.”

## Positioning

| | Grok Bot | Sora |
|--|----------|------|
| Product | Paid AI teammates + cloud computer | **Same UX goal, OSS** |
| Account | Sign in to SpaceXAI | **No Sora account (for now)** |
| Models | Included in subscription | **BYO keys** (OpenRouter / OpenAI / xAI) |
| Computer | Vendor-hosted cloud VM | **BYO E2B cloud sandbox VM** |
| App | Desktop + iOS | **Desktop (Win/Mac)** |

## Feature matrix

| Grok Bot user can… | Sora today | Gap |
|--------------------|------------|-----|
| Message specialized bots | **Working** | Polish |
| Bots work in **cloud computer** | **Working** (E2B desktop VM) | Bundled VM (no separate E2B signup) |
| Watch / take over desktop | **Working** | — |
| Sign into tools on computer | **Working** (Open desktop + Composio) | More first-party connectors |
| Approve risky actions | **Working** | — |
| Multiple bots in parallel | **Working** | Chief-of-staff UX polish |
| Routines (overnight jobs) | **Working** (cron/webhooks) | Demo capture → routine |
| Save workflow from demo | **Partial** (tool-step replay) | Screen recording |
| 24/7 while laptop closed | **Partial** | Hosted control plane + always-on VM |
| iOS messaging | **No** | Mobile app |
| No vendor login | **No** (Grok requires account) | **Yes — Sora advantage** |

## Honest gaps

1. **One bundled bill** — Grok rolls VM + models into subscription; Sora = E2B + OpenRouter/OpenAI bills separately  
2. **Always-on 24/7** — needs hosted runtime or always-on service (see [always-on.md](./always-on.md))  
3. **Demo → routine** — watch-once teaching UX not shipped  
4. **iOS** — not started  

## Architecture

```
Desktop app (chat, settings, no Sora login)
        ↓
   Local API (~/.sora)
        ↓
   Cloud sandbox VM (E2B) ← bot computer
        ↓
   Your model API (BYO subscription)
```
