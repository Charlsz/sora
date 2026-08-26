# Product targets (engineering)

**Purpose:** Sora is an open-source **AI teammate workspace** shipped as a **native desktop app for Windows and macOS** (no Linux installer, no mobile in v1).

**UX:** Messaging roster of bots — assign work, watch the computer, approve when asked. Not “ChatGPT with tools.”

**Backend / capability bar:** Match what serious open teammate/agent products already deliver. Primary references (engineering only — keep out of marketing/README):

- [elie222/rakazo](https://github.com/elie222/rakazo) — BYO model + pluggable computers, teammates, routines, integrations, sandboxes  
- [milind-soni/OpenMausBot](https://github.com/milind-soni/OpenMausBot) — messaging roster of bots, permission broker, computer panel, Composio, local harness, packaged desktop  

User-facing docs describe Sora on its own ([overview.md](./overview.md), [parity.md](./parity.md)).

## Ship shape (locked)

| Decision | Choice |
|----------|--------|
| Platforms | **Windows + macOS** desktop only |
| Shell | **Tauri** + local sidecar API (`127.0.0.1:7420`) |
| Data | Local `~/.sora` — no required cloud account |
| Models | Bring your own |
| Computer | Pluggable: local default, E2B / Docker (more providers as needed) |
| Web-only product | Dev convenience only — **release = installer** |

## Functional bar (must feel as complete as the references)

| Capability | Rakazo-like | OpenMausBot-like | Sora now | To reach ~100% |
|------------|-------------|------------------|----------|----------------|
| Packaged Win/Mac desktop | Electron client | Signed installers | Tauri path; polish + release | `desktop:build` + tagged installers, smoke on clean machines |
| Bot roster + chat | Yes | Messaging UI | Yes (Team sidebar) | Polish unread/pin later |
| Permission asks | Yes | Allow/Deny broker | Yes | Keep |
| BYO models | Pi / keys | Claude/Codex/Grok CLIs | API providers | Stay API/BYO (not CLI-driver clone) |
| Computer: files/shell/browser | Yes | Yes | Yes (local) | Keep |
| Computer: live watch / takeover | Desktop sandboxes | Box + Open desktop | **Cloud desktop stream + Open desktop** | Polish / deeper input tooling |
| Isolated / cloud computer | Docker, E2B, Daytona | Box, Local VM | E2B shell + Docker | Full desktop provider |
| Routines / webhooks | Yes | Yes + dedicated port | Cron + `/api/hooks` | Dedicated webhook port optional; always-on docs |
| Composio / app connectors | Composio + Pipedream | Composio marketplace | Composio plugin exists | One-click OAuth UX in Connections |
| MCP / OpenAPI | Yes | Partial | Yes | Keep |
| Multi-agent / delegate | Yes | Channels/teams | Yes | Team import later |
| Voice | Yes | ElevenLabs | No | Defer past desktop v1 |
| Mobile | Expo | No | No | Out of scope |
| Postgres self-host stack | Yes | No (local harness) | SQLite | **Keep SQLite** — desktop-first |

## Non-goals for desktop v1

- Linux installers  
- Mobile apps  
- Cloning Claude/Codex CLI as the only brain  
- Requiring Docker + Postgres to run the product  
- Hosted always-on SaaS relay (document VPS / always-on instead)

## Release definition: “first real version”

1. User downloads **Sora for Windows** or **Sora for Mac**  
2. Install → open → onboarding (name + keys / skip)  
3. Assign a task → approve → see work on Workspace  
4. Sidecar stays healthy for the session  

Then iterate Computer desktop parity and Composio UX toward the reference bar.
