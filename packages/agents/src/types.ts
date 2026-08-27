import type { ModelReference as ParsedModelRef } from "@sora/models";
import type { PermissionPolicy } from "@sora/permissions";
import type { ToolReference } from "@sora/tools";

export type AgentStatus = "idle" | "running" | "error" | "paused";

export type SkillReference = {
  name: string;
};

export type MemoryReference = {
  kind: "sqlite";
  agentId: string;
};

export type ModelReference = string | ParsedModelRef;

export type Agent = {
  id: string;
  slug: string;
  name: string;
  description: string;
  instructions: string;
  model: string;
  /** Hex accent for the tintable bot mark, e.g. #8B6BC9 */
  accentColor: string | null;
  tools: ToolReference[];
  skills: SkillReference[];
  capabilities: string[];
  /** Allow / ask / deny policy for tools and local computer. */
  policy: PermissionPolicy;
  memory: MemoryReference;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateAgentInput = {
  /** Display name. If omitted, a friendly unused name is picked. */
  name?: string;
  description?: string;
  instructions?: string;
  model?: string;
  accentColor?: string | null;
  tools?: string[];
  skills?: string[];
  capabilities?: string[];
  policy?: PermissionPolicy;
  slug?: string;
};

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
