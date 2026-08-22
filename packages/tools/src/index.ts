import { agentMessageTool, echoTool, httpRequestTool } from "./builtins.ts";
import { ToolRegistry } from "./types.ts";

export function createBuiltinToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(echoTool);
  registry.register(httpRequestTool);
  registry.register(agentMessageTool);
  return registry;
}

export { agentMessageTool, echoTool, httpRequestTool } from "./builtins.ts";
export {
  ToolRegistry,
  type Tool,
  type ToolContext,
  type ToolReference,
  type ToolResult,
} from "./types.ts";
