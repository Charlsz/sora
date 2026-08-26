# Sandbox & security

Sora can run agent terminals in an isolated cloud microVM (E2B) while keeping the product local-first and smaller than a full “cloud desktop” stack.

## Design vs Rakazo / Grok Bot

| | Grok Bot | Rakazo | **Sora** |
|--|----------|--------|----------|
| Default computer | Always-on cloud desktop | Docker / E2B Desktop / Daytona / Box | **Local** (free, fast) |
| Optional cloud | N/A | Full GUI computer | **E2B code sandbox** (shell + files only) |
| Browser | In cloud VM | In cloud VM | **Local Playwright** (no cloud desktop cost) |
| Durable state | Vendor cloud | Postgres + DATA_DIR checkpoints | SQLite under `~/.sora` |
| Stack weight | SaaS | Postgres, Graphile, auth, mobile | Bun + SQLite + Tauri |

**Why this is better on cost / size / performance for desktop users**

1. No full Linux desktop image until you need one (Daytona/desktop can come later).
2. Sandboxes idle out after 10 minutes by default (`idleMs`) instead of always-on Team Computers.
3. Workspace sync skips `node_modules`, `.git`, and large media — less upload latency.
4. Model provider keys never leave the host process.

## Security rules (non-negotiable)

1. **Host env is not inherited** by agent shells. Local terminal uses an allowlist (`PATH`, `HOME`, …). Keys matching `API_KEY`, `SECRET`, `TOKEN`, `OPENAI_*`, `SORA_*`, etc. are blocked.
2. **Fail closed.** If sandbox is enabled and the E2B key is missing or the VM cannot start, Sora **does not** fall back to the host shell.
3. **Provider keys stay on the host.** The E2B API key authenticates the host → E2B API only. Sandbox create uses empty `envs`. Tool `env` overrides are filtered with the same forbid list.
4. **Output scrubbing.** Known secret substrings are replaced with `[REDACTED]` before tool results return to the model/UI.
5. **Permissions still apply.** `terminal.exec` / `fs.write` still go through PermissionGate after isolation.
6. **Secrets file mode.** `~/.sora/secrets.json` is written with mode `0x600` on Unix.

## Enable sandbox

1. Settings → **Models & providers** → save an **E2B** key (or set `E2B_API_KEY`).
2. Computer panel → **Enable E2B sandbox**.
3. Agent `terminal` tool now syncs the workspace into `/home/user/workspace` on a Firecracker microVM, runs the command, and syncs files back.

CLI / config:

```json
{
  "sandbox": {
    "enabled": true,
    "provider": "e2b",
    "failClosed": true,
    "idleMs": 600000,
    "commandTimeoutMs": 120000
  }
}
```

## Modes

| Mode | Terminal | Files | Browser | Use when |
|------|----------|-------|---------|----------|
| Local (default) | Host, scrubbed env | Local workspace | Local Chromium | Daily coding, offline |
| E2B sandbox | MicroVM only | Synced to/from VM | Local Chromium | Untrusted code, stronger isolation |
| Daytona | Not shipped yet | — | — | Future |

## What we deliberately skip (for now)

- Full cloud GUI desktop (Rakazo Box / E2B Desktop) — high cost, larger images.
- Injecting OpenAI/Anthropic keys into the sandbox so “the VM can call APIs” — that is a credential leak by design; call APIs from the **host** tools instead (`http_request`, MCP, plugins).
- Silent “sandbox enabled but running local” — that lied about isolation.

## Threat model (honest)

| Threat | Mitigation |
|--------|------------|
| Agent reads `OPENAI_API_KEY` from shell env | Scrubbed local env; empty sandbox env |
| Sandbox down → host shell | Fail closed |
| Agent `echo $SECRET` in output | Scrub known secret values |
| Path escape on local FS | Workspace jail + command guards |
| Malicious code damages your OS | Enable E2B sandbox |
| E2B operator sees your workspace files | Only while sandbox is up; don’t put secrets in the workspace |
| Prompt injection → exfiltrate keys via HTTP tool | PermissionGate ask on `http.request`; review approvals |

Encrypted-at-rest for `secrets.json` (OS keychain / `SORA_ENCRYPTION_KEY`) is the next hardening step after this foundation.
