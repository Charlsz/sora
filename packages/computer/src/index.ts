export {
  createBrowser,
  LocalBrowser,
  PlaceholderBrowser,
  type LocalBrowserOptions,
} from "./browser.ts";
export {
  getBrowserInstallStatus,
  installPlaywrightChromium,
  type BrowserInstallStatus,
} from "./browser-install.ts";
export { LocalFilesystem, joinWorkspace } from "./filesystem.ts";
export {
  ComputerRegistry,
  LocalComputer,
  type LocalComputerOptions,
} from "./local.ts";
export {
  SandboxComputer,
  createAgentComputer,
  resolveE2bApiKey,
} from "./cloud/sandbox-computer.ts";
export { E2bSandboxProvider, E2bSandboxSession } from "./cloud/e2b-provider.ts";
export {
  E2bDesktopProvider,
  E2bDesktopSession,
} from "./cloud/e2b-desktop-provider.ts";
export {
  DockerSandboxProvider,
  DockerSandboxSession,
} from "./cloud/docker-provider.ts";
export { FakeSandboxProvider, FakeSandboxSession } from "./cloud/fake-provider.ts";
export type {
  SandboxCapabilities,
  SandboxCreateOptions,
  SandboxProvider,
  SandboxSession,
  SandboxSessionInfo,
} from "./cloud/types.ts";
export {
  buildSafeProcessEnv,
  collectSecretValues,
  isForbiddenEnvKey,
  scrubSecretsFromText,
  scrubSensitivePatterns,
} from "./security/index.ts";
export { LocalTerminal, assertCommandWorkspaceSafe } from "./terminal.ts";
export type {
  Browser,
  BrowserActionResult,
  BrowserNavigateResult,
  BrowserScreenshotResult,
  BrowserStatus,
  Computer,
  ComputerKind,
  FileStat,
  Filesystem,
  Terminal,
  TerminalOptions,
  TerminalResult,
} from "./types.ts";
