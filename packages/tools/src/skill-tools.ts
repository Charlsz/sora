import type { Tool, ToolContext, ToolResult } from "./types.ts";

/**
 * Declares that the agent wants to activate a shared skill for this turn.
 * Actual skill loading happens in the agent runner (skills stay out of the tool sandbox).
 * This tool exists so models can request skills explicitly; slash commands also work.
 */
export const invokeSkillTool: Tool = {
  name: "invoke_skill",
  description:
    "Activate a shared skill by name for the current agent run. The skill injects instructions and restricts tools to the skill allowlist ∩ agent tools.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Skill id or name" },
      task: {
        type: "string",
        description: "Optional task focus while running the skill",
      },
    },
    required: ["name"],
  },
  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const data = (input ?? {}) as { name?: string; task?: string };
    if (!data.name?.trim()) {
      return { ok: false, output: "", error: "name is required" };
    }
    // Runner intercepts this tool before execute in some paths; when called directly,
    // we only acknowledge — skill activation requires SkillRegistry via runner.
    return {
      ok: true,
      output: `Skill activation requested: ${data.name}${data.task ? ` — ${data.task}` : ""}. The runner should apply skill instructions on the next model turn.`,
      data: {
        skill: data.name.trim(),
        task: data.task,
        agentSlug: context.agentSlug,
      },
    };
  },
};
