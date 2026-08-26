# Always-on Sora (routines without your laptop)

Grok Bot runs in the cloud 24/7. Sora is local-first: **cron and webhooks only fire while the API process is running**. You can keep that process up on your own machine or on a small VPS.

Quick helper (prints or writes OS service files):

```bash
bun run always-on
bun run always-on:write   # writes under ~/.sora/service/
```

## What stays local

- Agent workspaces, SQLite history, and secrets remain under `~/.sora` (or `SORA_HOME`) on the host where the API runs.
- Webhooks are served at `http://<host>:7420/api/hooks/<path>` on that same host.

## Option A: Your desktop (Windows)

Use **Task Scheduler** to start Sora when you log in and restart it if it crashes.

1. Build or install the desktop app, or use the CLI: `bun run sora start --yes`
2. Open **Task Scheduler** → Create Task
3. **Triggers:** At log on (or At startup)
4. **Actions:** Start a program
   - Program: path to `sora.exe` (desktop) or `bun.exe`
   - Arguments: `run sora start --yes` (CLI) or leave empty for the desktop app
   - Start in: your Sora install directory
5. **Settings:** Restart on failure, every 1 minute, 3 attempts

For headless auto-approve (routines only, no permission UI), use `--yes`. Do not use `--yes` on a shared machine.

## Option B: Your desktop (macOS)

Use **launchd**:

```xml
<!-- ~/Library/LaunchAgents/com.sora.runtime.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.sora.runtime</string>
  <key>ProgramArguments</key>
  <array>
    <string>/path/to/bun</string>
    <string>run</string>
    <string>sora</string>
    <string>start</string>
    <string>--yes</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/path/to/sora</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/sora.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/sora.err</string>
</dict>
</plist>
```

Load: `launchctl load ~/Library/LaunchAgents/com.sora.runtime.plist`

Set `SORA_HOME` in the plist `EnvironmentVariables` if you want data outside the default `~/.sora`.

## Option C: Linux VPS (systemd)

On a small Linux VM (1 vCPU, 1 GB RAM is enough for light routines):

```bash
# Clone or copy your Sora install; install Bun
export SORA_HOME=/var/lib/sora
bun run sora init
# Add provider keys to $SORA_HOME/secrets.json
```

Create `/etc/systemd/system/sora.service`:

```ini
[Unit]
Description=Sora agent runtime
After=network-online.target

[Service]
Type=simple
User=sora
Environment=SORA_HOME=/var/lib/sora
WorkingDirectory=/opt/sora
ExecStart=/usr/local/bin/bun run sora start --yes --host 127.0.0.1 --port 7420
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sora
```

Expose webhooks safely:

- Put **nginx** or **Caddy** in front with TLS and a shared secret header (`x-sora-webhook-secret`) on workflow triggers.
- Or tunnel with **Tailscale** / **Cloudflare Tunnel** so you never open port 7420 to the public internet.

## Option D: Future hosted relay (not shipped yet)

A optional **Sora relay** would:

1. Hold webhook endpoints in the cloud
2. Forward payloads to your home API over an outbound WebSocket
3. Never store conversation content by default

That keeps Grok-style “always reachable webhooks” without moving your data off disk. Track GitHub issues for relay design; until then, use A–C.

## Checklist

| Goal | Approach |
|------|----------|
| Routines while PC is on | Desktop app or `sora start` at login |
| Routines 24/7 | VPS + systemd + `SORA_HOME` on the server |
| Webhooks from the internet | Reverse proxy + TLS + webhook secret |
| Chat from phone | Not in scope yet (Tier C) |

## Verify

```bash
curl -s http://127.0.0.1:7420/api/health
curl -X POST http://127.0.0.1:7420/api/hooks/my-routine -H "content-type: application/json" -d '{}'
```

Cron fires every minute when the workflow engine is running; check **Routines** in the UI or `GET /api/workflows`.
