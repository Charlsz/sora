# Sandbox & security

Sora can run agent terminals in an isolated cloud microVM (E2B) while keeping the control plane local and lighter than a full always-on desktop stack.

## Design

| | **Sora** |
|--|----------|
| Default computer | **Cloud sandbox (E2B desktop)** when keyed; local available for dev |
| Browser | In cloud desktop VM (or local Playwright when local) |
| Durable state | SQLite under `~/.sora` |
| Stack | Bun + SQLite + Tauri |

**Why this stays lean for desktop users**

1. Sandboxes idle out after 10 minutes by default (`idleMs`) instead of always-on billed VMs.  
2. Workspace sync skips `node_modules`, `.git`, and large media — less upload latency.  
3. Model provider keys never leave the host process.
