# Overview

**Sora is open-source Grok Bot.** Same idea — AI teammates you message like coworkers, each with a real cloud computer, signing into your tools and finishing work end-to-end. The difference: **you bring your own model subscription** (OpenAI, Grok, OpenRouter, …) and **there is no Sora account** to sign into.

Grok Bot is paid and bundled. Sora is free software you download; you pay your providers directly.

## What you get

| Grok Bot | Sora |
|----------|------|
| AI teammates with a cloud computer | Same |
| Message bots, assign work, approve when needed | Same |
| Watch the bot’s desktop | Same (E2B sandbox stream) |
| Bots sign into Gmail, Salesforce, LinkedIn, … | Composio connectors (BYO) |
| Routines + multi-bot parallel work | Cron/webhooks + multi-agent |
| **Paid Grok Bot / Cursor subscription** | **Your own API keys** |
| **Sign in to SpaceXAI** | **No Sora login (for now)** |

## How it works

1. **Download** the desktop app (Windows / Mac).
2. **Connect your AI** — paste a key from OpenRouter, OpenAI, or xAI (your existing provider billing).
3. **Connect bot computer** — E2B sandbox key spins up a **cloud VM** per bot (browser, files, terminal, desktop).
4. **Create teammates** — Sales Outbound, Inbox Manager, etc.
5. **Give tasks** — they work in the cloud; you **Watch** or **Open desktop** to sign into tools; they ping you for approval.

Chat history and keys live in the app on your machine (`~/.sora`). **Work runs in the cloud** so jobs do not stop when you close the laptop (while the VM is up).

## What “bring your subscription” means

You cannot paste your ChatGPT Plus password and consume that quota — no product offers that officially. You **can**:

- Use **OpenRouter** (one key → GPT, Claude, Grok, Gemini)
- Use **OpenAI** / **xAI** keys tied to your developer account (same models, pay-as-you-go on your bill)

That is the open-source trade: **no Sora monthly fee**, but you wire up providers yourself once in onboarding.

## Docs

- [Computer](./computer.md) — cloud sandbox VMs  
- [parity.md](./parity.md) — honest gap list vs Grok Bot  
- [desktop.md](./desktop.md) — install & release
