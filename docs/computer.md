# Computer

The **Computer** is the agent’s coworker machine: filesystem, terminal, browser, and optionally a watchable display. Chat, secrets, and approvals stay on your machine; where the Computer *runs* is a provider choice.

```text
you → task → agent (local control plane)
                ↓
         Computer provider
         local | e2b | docker* | remote* | host*
```

\* Planned — selecting them fails closed with a clear error today.

## Providers

| Provider | Status | Terminal | Files | Browser | Live display |
|----------|--------|----------|-------|---------|--------------|
| `local` | **Default, working** | Host (scrubbed env) | Agent workspace jail | Playwright Chromium | Watch + screenshots |
| `e2b` | **Opt-in, working** | Firecracker microVM | Sync to/from workspace | Local Playwright | Watch host browser |
| `docker` | **Opt-in, working** | Linux container (bind mount) | Shared via volume | Local Playwright | Watch host browser |
| `fake` | Tests only | In-memory | In-memory | — | — |
| `daytona` / `remote` / `host` | Not shipped | — | — | — | — |

Config (`~/.sora/config.json`):

```json
{
  "computer": {
    "provider": "local",
    "failClosed": true,
    "idleMs": 600000,
    "commandTimeoutMs": 120000,
    "preferDisplay": true
  }
}
```

Legacy `sandbox.enabled` + `sandbox.provider` still loads and maps into `computer`. Prefer `computer` for new setups.

## Local Computer (default)

- Workspace under `~/.sora/agents/<slug>/workspace`
- Terminal does **not** inherit host `process.env` (API keys stay out)
- Browser profile can persist cookies/logins per agent
- UI Computer panel can request browser screenshots

## E2B Computer (opt-in)

1. Save an E2B API key under Models & providers (or `E2B_API_KEY`).
2. Computer panel → enable cloud sandbox, **or** set `"computer": { "provider": "e2b" }`.
3. Terminal + file sync run in the microVM; browser stays on the host for cost/size.

Fail-closed: missing key or VM start failure → **error**, never silent host shell. Details: [sandbox-security.md](./sandbox-security.md).

## Display (“watch the computer”)

| Mode | Today |
|------|--------|
| Local headed Playwright | You can watch the real window on this machine |
| **Watch** in Computer panel | Polls `GET /api/agents/:slug/computer/display` every 2s |
| Live remote desktop stream (cloud GUI) | **Not yet** — needs a desktop-capable provider |

## Always-on

```bash
bun run always-on          # print instructions
bun run always-on:write    # write Task Scheduler / LaunchAgent files under ~/.sora/service
```

See [always-on.md](./always-on.md).

## What “100% coworker Computer” still needs

1. Persistent remote **desktop** Computer with a live stream (not just host browser)  
2. Optional VPS (`remote`) SSH provider  
3. Explicit `host` provider (control your real desktop) — high risk, opt-in only  

Product-level gap list: [parity.md](./parity.md).
