# Overview

**Sora** is an open-source desktop app for **AI teammates with a real computer**. Message specialized bots, give them work, watch their cloud sandbox, approve when needed, and run routines — while you bring your own models and sandbox provider.

## Product promise

**AI teammates, not chatbots.** You assign a task like you would to a coworker. The bot works end-to-end in its **own cloud sandbox** (browser, files, terminal, desktop), signs into your tools via connectors, and comes back with finished work or an approval ask.

**Desktop app, cloud execution.** The UI and your chat history run locally (`~/.sora`). Each bot’s **Computer** is an isolated cloud VM (E2B sandbox by default) so work does not stall when you close the laptop.

**Bring your providers.** Models (OpenRouter, OpenAI, Anthropic, Gemini, xAI, …) and the sandbox VM (E2B) use your accounts — no Sora subscription and no Sora login (for now).

**Windows + macOS first.** Desktop daily driver. Mobile and always-on hosting are later.

## At a glance

| | Sora |
|--|------|
| Idea | AI teammates with a cloud computer |
| Computer | Per-bot cloud sandbox (E2B) |
| Models | Bring your own API keys |
| Tools / OAuth | Composio + plugins (BYO keys) |
| Data / chat | Local app + `~/.sora` |
| Approvals | Yes |
| Routines | Cron / webhooks / record-from-chat |
| Watch computer | Watch + Open desktop stream |

## What “bring your subscription” means

You connect provider API keys (OpenRouter recommended for many models in one key). Billing stays on your provider account. Sora does not bill you and does not require a Sora account.

## Docs

- [Computer](./computer.md) — cloud sandbox VMs  
- [parity.md](./parity.md) — feature status  
- [desktop.md](./desktop.md) — install & release
