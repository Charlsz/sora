import type { PermissionAction, PermissionDecision, PermissionPolicy } from "./types.ts";
import { DEFAULT_AGENT_POLICY } from "./types.ts";

/** High-level Grok-style capability rows shown in the teammate UI. */
export type CapabilityId =
  | "localComputer"
  | "files"
  | "terminal"
  | "browser"
  | "apps"
  | "external"
  | "automation";

export type CapabilityLevels = Record<CapabilityId, PermissionDecision>;

export const CAPABILITY_ORDER: CapabilityId[] = [
  "localComputer",
  "files",
  "terminal",
  "browser",
  "apps",
  "external",
  "automation",
];

export const CAPABILITY_META: Record<
  CapabilityId,
  { label: string; hint: string }
> = {
  localComputer: {
    label: "Local computer",
    hint: "This PC files & commands (separate from sandbox)",
  },
  files: {
    label: "Files",
    hint: "Read, write, and delete workspace files",
  },
  terminal: {
    label: "Terminal",
    hint: "Run shell commands",
  },
  browser: {
    label: "Browser",
    hint: "Navigate, click, type, and screenshot",
  },
  apps: {
    label: "Apps & connectors",
    hint: "HTTP and connected apps (GitHub, Gmail, …)",
  },
  external: {
    label: "External actions",
    hint: "Send, publish, overwrite, or delete outward",
  },
  automation: {
    label: "Automation",
    hint: "Delegate to other teammates and routines",
  },
};

const CATEGORY_ACTIONS: Record<
  Exclude<CapabilityId, "localComputer">,
  PermissionAction[]
> = {
  files: ["fs.read", "fs.write", "fs.delete"],
  terminal: ["terminal.exec"],
  browser: [
    "browser.navigate",
    "browser.click",
    "browser.type",
    "browser.screenshot",
    "browser.close",
  ],
  apps: ["http.request"],
  external: ["agent.message"],
  automation: ["agent.delegate"],
};

export const DEFAULT_CAPABILITY_LEVELS: CapabilityLevels = {
  localComputer: "ask",
  files: "ask",
  terminal: "ask",
  browser: "ask",
  apps: "ask",
  external: "ask",
  automation: "ask",
};

/** Prefer deny when a capability maps to multiple overlapping actions. */
function stricter(
  a: PermissionDecision,
  b: PermissionDecision,
): PermissionDecision {
  const rank = { deny: 0, ask: 1, allow: 2 } as const;
  return rank[a] <= rank[b] ? a : b;
}

export function policyFromCapabilities(
  levels: CapabilityLevels,
): PermissionPolicy {
  const actions: PermissionPolicy["actions"] = {
    ...DEFAULT_AGENT_POLICY.actions,
  };

  for (const [category, decision] of Object.entries(levels) as Array<
    [CapabilityId, PermissionDecision]
  >) {
    if (category === "localComputer") continue;
    for (const action of CATEGORY_ACTIONS[category]) {
      const prev = actions[action];
      actions[action] = prev ? stricter(prev, decision) : decision;
    }
  }

  // Files “allow” should still allow reads even if external tighten delete.
  if (levels.files === "allow") {
    actions["fs.read"] = "allow";
    actions["fs.write"] = "allow";
  } else if (levels.files === "deny") {
    actions["fs.read"] = "deny";
    actions["fs.write"] = "deny";
    actions["fs.delete"] = "deny";
  }

  return {
    default: "ask",
    actions,
    localComputer: levels.localComputer,
    capabilities: { ...levels },
  };
}

export function capabilitiesFromPolicy(
  policy: PermissionPolicy | null | undefined,
): CapabilityLevels {
  const stored = policy?.capabilities;
  if (stored) {
    return {
      ...DEFAULT_CAPABILITY_LEVELS,
      ...stored,
      localComputer:
        stored.localComputer ?? policy?.localComputer ?? "ask",
    };
  }

  const actions = policy?.actions ?? DEFAULT_AGENT_POLICY.actions;
  const pick = (
    keys: PermissionAction[],
    fallback: PermissionDecision,
  ): PermissionDecision => {
    const values = keys
      .map((k) => actions[k])
      .filter(Boolean) as PermissionDecision[];
    if (values.length === 0) return fallback;
    return values.reduce((acc, v) => stricter(acc, v));
  };

  return {
    localComputer: policy?.localComputer ?? "ask",
    files: pick(["fs.read", "fs.write", "fs.delete"], "ask"),
    terminal: pick(["terminal.exec"], "ask"),
    browser: pick(
      ["browser.navigate", "browser.click", "browser.type"],
      "ask",
    ),
    apps: pick(["http.request"], "ask"),
    external: pick(["agent.message"], "ask"),
    automation: pick(["agent.delegate"], "ask"),
  };
}

export function normalizePolicy(
  policy: PermissionPolicy | null | undefined,
): PermissionPolicy {
  if (!policy) {
    return policyFromCapabilities(DEFAULT_CAPABILITY_LEVELS);
  }
  const base = {
    default: policy.default ?? "ask",
    actions: { ...DEFAULT_AGENT_POLICY.actions, ...policy.actions },
    localComputer: policy.localComputer ?? "ask",
    capabilities: policy.capabilities,
  };
  if (!base.capabilities) {
    return {
      ...base,
      capabilities: capabilitiesFromPolicy(base),
    };
  }
  return base;
}
