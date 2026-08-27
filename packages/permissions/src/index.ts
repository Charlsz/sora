export {
  AUTO_APPROVE_POLICY,
  DEFAULT_AGENT_POLICY,
  PermissionGate,
  createPermissionGate,
  type AskHandler,
  type PermissionGateOptions,
} from "./gate.ts";
export {
  CAPABILITY_META,
  CAPABILITY_ORDER,
  DEFAULT_CAPABILITY_LEVELS,
  capabilitiesFromPolicy,
  normalizePolicy,
  policyFromCapabilities,
  type CapabilityId,
  type CapabilityLevels,
} from "./capabilities.ts";
export type {
  PermissionAction,
  PermissionDecision,
  PermissionPolicy,
  PermissionRequest,
  PermissionResolution,
} from "./types.ts";
