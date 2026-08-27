export type PermissionDecision = "allow" | "deny" | "ask";

export type PermissionAction =
  | "fs.read"
  | "fs.write"
  | "fs.delete"
  | "terminal.exec"
  | "http.request"
  | "browser.navigate"
  | "browser.click"
  | "browser.type"
  | "browser.screenshot"
  | "browser.close"
  | "agent.message"
  | "agent.delegate";

export type PermissionRequest = {
  agentId: string;
  agentSlug: string;
  action: PermissionAction;
  resource: string;
  detail?: Record<string, unknown>;
};

export type PermissionPolicy = {
  /** Exact action → decision. */
  actions: Partial<Record<PermissionAction, PermissionDecision>>;
  /** Optional default when action is unspecified. */
  default: PermissionDecision;
  /**
   * Separate gate for host-machine (This PC) work.
   * Sandbox/cloud computer uses `actions` only.
   */
  localComputer?: PermissionDecision;
  /**
   * UI capability rows. Kept for exact round-trip in the settings panel.
   */
  capabilities?: Partial<
    Record<
      | "localComputer"
      | "files"
      | "terminal"
      | "browser"
      | "apps"
      | "external"
      | "automation",
      PermissionDecision
    >
  >;
};

export type PermissionResolution = {
  decision: PermissionDecision;
  reason: string;
};

export const DEFAULT_AGENT_POLICY: PermissionPolicy = {
  default: "ask",
  actions: {
    "fs.read": "allow",
    "fs.write": "ask",
    "fs.delete": "ask",
    "terminal.exec": "ask",
    "http.request": "ask",
    "browser.navigate": "ask",
    "browser.click": "ask",
    "browser.type": "ask",
    "browser.screenshot": "allow",
    "browser.close": "allow",
    "agent.message": "allow",
    "agent.delegate": "ask",
  },
};

/** Development-friendly policy used when SORA_AUTO_APPROVE=1 or --yes. */
export const AUTO_APPROVE_POLICY: PermissionPolicy = {
  default: "allow",
  actions: {
    "fs.read": "allow",
    "fs.write": "allow",
    "fs.delete": "allow",
    "terminal.exec": "allow",
    "http.request": "allow",
    "browser.navigate": "allow",
    "browser.click": "allow",
    "browser.type": "allow",
    "browser.screenshot": "allow",
    "browser.close": "allow",
    "agent.message": "allow",
    "agent.delegate": "allow",
  },
};
