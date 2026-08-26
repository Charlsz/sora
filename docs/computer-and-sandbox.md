# Computer and sandbox

## Local (default)

- Filesystem jailed to the agent workspace
- Terminal with scrubbed env (no API keys)
- Browser via Playwright Chromium when installed

## Cloud sandbox (opt-in)

Enable in Computer panel after adding an **E2B** key.

- Terminal + file sync run in an E2B Firecracker microVM
- Browser stays local (cost/size vs Rakazo full desktop)
- Fail-closed: missing key → error, not host shell

Deep dive: [sandbox-security.md](./sandbox-security.md).
