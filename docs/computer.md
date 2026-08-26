# Computer

Each bot gets **its own cloud sandbox** — a virtual machine with browser, files, terminal, and a watchable desktop. Work runs in the cloud so jobs do not stall when you step away.

```text
you → task → bot (local app / chat)
                ↓
         Cloud sandbox VM (E2B)
         browser · files · terminal · desktop stream
```

Chat, secrets, and approvals stay in the desktop app (`~/.sora`). Execution happens in the VM.

## Default: E2B cloud sandbox

Onboarding asks for an **E2B key** — that spins up isolated Firecracker microVMs with a full Linux desktop when needed.

| Capability | Status |
|------------|--------|
| Terminal + files in VM | **Working** |
| Desktop stream (Watch / Open desktop) | **Working** (`@e2b/desktop`) |
| Browser inside VM | **Working** on cloud desktop |
| Sign into tools on desktop | **Working** via Open desktop takeover |
| Always-on 24/7 without your PC | **Partial** — VM TTL + need runtime/API up |

Config (`~/.sora/config.json`):

```json
{
  "computer": {
    "provider": "e2b",
    "preferDisplay": true,
    "failClosed": true,
    "idleMs": 600000,
    "commandTimeoutMs": 120000
  }
}
```

## Watch & takeover

| Action | How |
|--------|-----|
| **Watch** | Polls `GET /api/agents/:slug/computer/display` for desktop screenshots |
| **Open desktop** | Live stream URL via `POST …/computer/takeover` — sign in, 2FA, click through UIs |

## Other providers (advanced)

| Provider | Use |
|----------|-----|
| `local` | Dev / fallback — runs on your PC |
| `docker` | Local Linux container |
| `daytona` / `remote` / `host` | Not shipped yet |

Fail-closed: missing E2B key → clear error, never silent fallback to your host shell.

## What's still missing for full teammate Computer

1. Bundled VM in one subscription (Sora uses BYO E2B today)  
2. Demo capture → routine (screen recording UX)  
3. 24/7 hosted control plane without your desktop app running  
4. Native mobile messaging surface  

See [parity.md](./parity.md).
