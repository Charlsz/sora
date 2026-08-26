# Computer and sandbox

Canonical doc: **[computer.md](./computer.md)**. Security deep dive: [sandbox-security.md](./sandbox-security.md).

## Local (default)

- Filesystem jailed to the agent workspace  
- Terminal with scrubbed env (no API keys)  
- Browser via Playwright Chromium when installed  

## Cloud sandbox (opt-in E2B)

Enable in Computer panel after adding an **E2B** key.

- Terminal + file sync run in an E2B Firecracker microVM  
- Browser stays local (smaller/cheaper than a full cloud desktop)  
- Fail-closed: missing key → error, not host shell  
