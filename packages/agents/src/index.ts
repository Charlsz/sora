import {
  SoraRuntime,
  type RuntimeOptions,
} from "@sora/core";
import {
  SqliteConversationStore,
  SqliteMemoryStore,
} from "@sora/memory";
import {
  createDefaultProviderRegistry,
  type ProviderRegistry,
} from "@sora/models";
import {
  createPermissionGate,
  type PermissionGate,
  type PermissionGateOptions,
} from "@sora/permissions";
import { SkillRegistry } from "@sora/skills";
import {
  createBuiltinToolRegistry,
  type ToolRegistry,
} from "@sora/tools";
import {
  WorkflowEngine,
  WorkflowStore,
} from "@sora/workflows";
import { DelegationService } from "./delegation.ts";
import { AgentRunner } from "./runner.ts";
import { AgentStore } from "./store.ts";
import type { CreateAgentInput } from "./types.ts";

export type CreateSoraServicesOptions = RuntimeOptions & {
  permissions?: PermissionGateOptions;
  /** Extra skill discovery roots (e.g. repo examples). */
  skillRoots?: string[];
};

export type SoraServices = {
  runtime: SoraRuntime;
  agents: AgentStore;
  runner: AgentRunner;
  tools: ToolRegistry;
  providers: ProviderRegistry;
  memory: SqliteMemoryStore;
  conversations: SqliteConversationStore;
  permissions: PermissionGate;
  delegation: DelegationService;
  skills: SkillRegistry;
  workflows: WorkflowStore;
  workflowEngine: WorkflowEngine;
  reloadProviders: () => void;
};

export function createSoraServices(
  options: CreateSoraServicesOptions = {},
): SoraServices {
  const runtime = new SoraRuntime(options);
  runtime.ensureInitialized();

  const agents = new AgentStore(runtime.db, runtime.paths, runtime.events);
  const memory = new SqliteMemoryStore(runtime.db);
  const conversations = new SqliteConversationStore(runtime.db);
  const tools = createBuiltinToolRegistry();
  const providers = createDefaultProviderRegistry({
    secrets: runtime.secrets,
  });
  const permissions = createPermissionGate({
    events: runtime.events,
    ...options.permissions,
  });
  const skills = new SkillRegistry({
    skillsDir: runtime.paths.skills,
    extraRoots: options.skillRoots,
  });
  skills.discover();

  const runner = new AgentRunner(
    agents,
    providers,
    tools,
    conversations,
    memory,
    runtime.paths,
    runtime.events,
    permissions,
  );
  const delegation = new DelegationService({
    agents,
    runner,
    events: runtime.events,
  });
  runner.setDelegation(delegation);
  runner.setSkills(skills);

  const workflows = new WorkflowStore(runtime.db);
  const workflowEngine = new WorkflowEngine({
    store: workflows,
    events: runtime.events,
    executor: {
      run: (input) => runner.run(input),
    },
  });

  /** Re-read secrets from disk and hot-reload provider clients. */
  const reloadProviders = () => {
    runtime.ensureInitialized();
    providers.applySecrets(runtime.secrets);
  };

  return {
    runtime,
    agents,
    runner,
    tools,
    providers,
    memory,
    conversations,
    permissions,
    delegation,
    skills,
    workflows,
    workflowEngine,
    reloadProviders,
  };
}

export function initSora(options: RuntimeOptions & { force?: boolean } = {}) {
  const runtime = new SoraRuntime(options);
  const config = runtime.init(options.force ?? false);
  return { runtime, config };
}

export async function createAgent(
  services: SoraServices,
  input: CreateAgentInput,
) {
  return services.agents.create(input, services.runtime.config.defaultModel);
}

export { DelegationService } from "./delegation.ts";
export { AgentRunner, type RunAgentInput, type RunAgentResult } from "./runner.ts";
export { AgentStore } from "./store.ts";
export {
  slugify,
  type Agent,
  type AgentStatus,
  type CreateAgentInput,
  type MemoryReference,
  type ModelReference,
  type SkillReference,
} from "./types.ts";
