import type { ModelReference as ParsedModelRef } from "@sora/models";
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
  tools: ToolReference[];
  skills: SkillReference[];
  capabilities: string[];
  memory: MemoryReference;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateAgentInput = {
  name: string;
  description?: string;
  instructions?: string;
  model?: string;
  tools?: string[];
  skills?: string[];
  capabilities?: string[];
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
