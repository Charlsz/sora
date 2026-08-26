# Research notes (internal)

Audit date: 2026-08-25. Goal: Win/Mac **desktop** Grok Bot alternative that is as capable as leading open implementations, without becoming a Postgres SaaS clone.

## Primary references

- **Product feeling:** [Grok Bot](https://x.ai/bot) — workers with a computer, approvals, routines  
- **Backend / feature bar:** open Grok alternatives (see [targets.md](./targets.md) for the engineering checklist). Study their computer providers, permission brokers, connector UX, and packaged desktop flows — do not copy their stacks wholesale.

## Locked decisions

1. **Desktop-first:** Tauri + sidecar on Windows and macOS. Web UI is for development.  
2. **Local control plane:** SQLite + `~/.sora`, not Postgres/Graphile as a requirement.  
3. **BYO models via API keys**, not “must install Claude/Codex CLI.”  
4. **Pluggable Computer** (local / E2B / Docker → full desktop stream next).  
5. **User-facing docs** compare to Grok Bot only; competitor names stay in `targets.md` / this file.

## Still open for v1 polish

- Packaged installer smoke (Win + Mac) and release tagging  
- Computer live desktop stream / takeover  
- Composio one-click connection UX  
- Conversation list / routine run history polish (partially done)  
- Encrypted `secrets.json` (optional key — done when `SORA_ENCRYPTION_KEY` set)  
- Sidecar watchdog + clearer spawn errors  
- Browser bundling in installer  

Living user gap list: [parity.md](./parity.md). Engineering bar: [targets.md](./targets.md).
