import { agentMessageTool, echoTool, httpRequestTool } from "./builtins.ts";
import {
  deleteFileTool,
  listDirTool,
  readFileTool,
  terminalTool,
  writeFileTool,
} from "./computer-tools.ts";
import { delegateTaskTool } from "./delegation-tools.ts";
import { invokeSkillTool } from "./skill-tools.ts";
import { ToolRegistry } from "./types.ts";

export function createBuiltinToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(echoTool);
  registry.register(httpRequestTool);
  registry.register(agentMessageTool);
  registry.register(delegateTaskTool);
  registry.register(invokeSkillTool);
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(listDirTool);
  registry.register(deleteFileTool);
  registry.register(terminalTool);
  return registry;
}

export { agentMessageTool, echoTool, httpRequestTool } from "./builtins.ts";
export {
  deleteFileTool,
  listDirTool,
  readFileTool,
  terminalTool,
  writeFileTool,
} from "./computer-tools.ts";
export { delegateTaskTool } from "./delegation-tools.ts";
export { invokeSkillTool } from "./skill-tools.ts";
export {
  ToolRegistry,
  type Tool,
  type ToolContext,
  type ToolReference,
  type ToolResult,
} from "./types.ts";
