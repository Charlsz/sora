# Overview

Sora is an open-source **Grok Bot–style agent workspace** you run yourself. Chat with specialized AI coworkers, give them a real computer (browser, files, terminal), approve what they touch, run routines, and keep conversations, memory, and secrets under `~/.sora`.

## Product promise

**AI coworker, not just a chatbot.** You assign a task; the agent works through a **Computer** (browse, filesystem, terminal, connectors) and comes back with finished work or an approval ask.

**Local-first control plane.** The app, API, chat history, secrets, and approvals run on your machine. Where the Computer itself runs is a provider choice (this machine, Docker, E2B, a VPS, later your host desktop)—not “everything must be cloud.”

**Windows + macOS first.** Desktop daily driver. Mobile, voice, and Linux installers are deferred.

## vs Grok Bot

| | Grok Bot | **Sora** |
|--|----------|----------|
| Idea | AI teammates with a real computer | Same |
| Control / data | Vendor cloud | **Your machine** (`~/.sora`) |
| Models | Vendor-selected | **Bring your own** |
| Computer | Persistent cloud VM (shared per account) | **Pluggable Computer** (local / cloud / VPS) |
| Always-on | Cloud by default | While your runtime (or remote Computer) is up |
| Approvals | Yes | Yes (allow once / session / deny) |
| Routines | Schedule + events | Cron + webhooks (+ record-from-chat) |
| Watch computer | Live Agent Computer | Local preview today; live remote stream next |

See [computer.md](./computer.md) for the Computer abstraction and [research.md](./research.md) for the gap list.
