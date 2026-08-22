import type { Tool, ToolContext, ToolResult } from "./types.ts";

async function requirePermission(
  context: ToolContext,
  action: import("@sora/permissions").PermissionAction,
  resource: string,
  detail?: Record<string, unknown>,
) {
  if (!context.permissions) return;
  await context.permissions.assert({
    agentId: context.agentId,
    agentSlug: context.agentSlug,
    action,
    resource,
    detail,
  });
}

export const delegateTaskTool: Tool = {
  name: "delegate_task",
  description:
    "Delegate a task to another specialized agent. Optionally prefer a specific agent by name/slug or list required capabilities.",
  inputSchema: {
    type: "object",
    properties: {
      task: { type: "string", description: "Task for the other agent" },
      prefer: {
        type: "string",
        description: "Preferred agent name or slug, if known",
      },
      capabilities: {
        type: "array",
        items: { type: "string" },
        description: "Required capabilities used for routing",
      },
    },
    required: ["task"],
  },
  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const data = (input ?? {}) as {
      task?: string;
      prefer?: string;
      capabilities?: string[];
    };
    if (!data.task?.trim()) {
      return { ok: false, output: "", error: "task is required" };
    }
    if (!context.delegation) {
      return {
        ok: false,
        output: "",
        error: "Delegation is not available in this context",
      };
    }

    try {
      await requirePermission(context, "agent.delegate", data.prefer ?? "*", {
        task: data.task,
      });
      const result = await context.delegation.delegate({
        fromAgentId: context.agentId,
        fromAgentSlug: context.agentSlug,
        task: data.task,
        prefer: data.prefer,
        requiredCapabilities: data.capabilities,
      });
      const output = [
        `Delegated to ${result.toAgentSlug}`,
        result.reply,
        result.toolCalls.length
          ? `Tools used: ${result.toolCalls.map((t) => t.name).join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
      return {
        ok: true,
        output,
        data: result,
      };
    } catch (error) {
      return {
        ok: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
