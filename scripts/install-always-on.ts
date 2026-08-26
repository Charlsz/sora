#!/usr/bin/env bun
/**
 * Print OS-specific always-on install steps, or write a Windows Task Scheduler XML.
 *
 * Usage:
 *   bun run scripts/install-always-on.ts
 *   bun run scripts/install-always-on.ts --write
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const write = process.argv.includes("--write");
const repo = join(import.meta.dir, "..");
const outDir = join(homedir(), ".sora", "service");

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

console.log("Sora always-on helper");
console.log("Routines (cron/webhooks) only fire while the API is running.");
console.log("Docs: docs/always-on.md\n");

if (isWin) {
  const bun = process.execPath;
  const args = `run sora start --yes`;
  const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Keep Sora API running for routines</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${bun}</Command>
      <Arguments>${args}</Arguments>
      <WorkingDirectory>${repo}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;
  console.log("Windows: import this task in Task Scheduler (At log on).");
  if (write) {
    mkdirSync(outDir, { recursive: true });
    const path = join(outDir, "sora-always-on.xml");
    writeFileSync(path, xml, "utf8");
    console.log(`Wrote ${path}`);
    console.log(
      `Import: schtasks /Create /TN "SoraAlwaysOn" /XML "${path}" /F`,
    );
  } else {
    console.log("Re-run with --write to save ~/.sora/service/sora-always-on.xml");
  }
} else if (isMac) {
  const bun = process.execPath;
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.sora.runtime</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bun}</string>
    <string>run</string>
    <string>sora</string>
    <string>start</string>
    <string>--yes</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${repo}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
`;
  console.log("macOS: install a LaunchAgent (KeepAlive).");
  if (write) {
    mkdirSync(outDir, { recursive: true });
    const path = join(outDir, "com.sora.runtime.plist");
    writeFileSync(path, plist, "utf8");
    console.log(`Wrote ${path}`);
    console.log(
      `Install: cp "${path}" ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.sora.runtime.plist`,
    );
  } else {
    console.log("Re-run with --write to save ~/.sora/service/com.sora.runtime.plist");
  }
} else {
  console.log("Linux: use systemd user unit — see docs/always-on.md");
}

console.log("\nTip: prefer a small VPS + remote Computer for true away-from-laptop.");
