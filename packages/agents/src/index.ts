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
import {
  createBuiltinToolRegistry,
  type ToolRegistry,
} from "@sora/tools";
import { DelegationService } from "./delegation.ts";
import { AgentRunner } from "./runner.ts";
import { AgentStore } from "./store.ts";
import type { CreateAgentInput } from "./types.ts";

export type CreateSoraServicesOptions = RuntimeOptions & {
  permissions?: PermissionGateOptions;
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
  const providers = createDefaultProviderRegistry();
  const permissions = createPermissionGate({
    events: runtime.events,
    ...options.permissions,
  });
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
