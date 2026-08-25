import { agentMessageTool, echoTool, httpRequestTool } from "./builtins.ts";
import {
  browserClickTool,
  browserCloseTool,
  browserNavigateTool,
  browserScreenshotTool,
  browserTypeTool,
  deleteFileTool,
  listDirTool,
  readFileTool,
  terminalTool,
  writeFileTool,
} from "./computer-tools.ts";
import { delegateTaskTool } from "./delegation-tools.ts";
import { invokeSkillTool } from "./skill-tools.ts";
import { saveMemoryTool, searchMemoryTool } from "./memory-tools.ts";
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
  registry.register(browserNavigateTool);
  registry.register(browserClickTool);
  registry.register(browserTypeTool);
  registry.register(browserScreenshotTool);
  registry.register(browserCloseTool);
  registry.register(saveMemoryTool);
  registry.register(searchMemoryTool);
  return registry;
}

export { agentMessageTool, echoTool, httpRequestTool } from "./builtins.ts";
export {
  browserClickTool,
  browserCloseTool,
  browserNavigateTool,
  browserScreenshotTool,
  browserTypeTool,
  deleteFileTool,
  listDirTool,
  readFileTool,
  terminalTool,
  writeFileTool,
} from "./computer-tools.ts";
export { delegateTaskTool } from "./delegation-tools.ts";
export { invokeSkillTool } from "./skill-tools.ts";
export { saveMemoryTool, searchMemoryTool } from "./memory-tools.ts";
export {
  ToolRegistry,
  type Tool,
  type ToolContext,
  type ToolReference,
  type ToolResult,
} from "./types.ts";
