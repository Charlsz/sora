import type { Tool, ToolContext, ToolResult } from "./types.ts";
import { httpRequestTool } from "./http-request.ts";

/** @deprecated use httpRequestTool from http-request.ts */
export { httpRequestTool };

/** Agents can leave notes for other agents (delegation uses delegate_task). */
export const agentMessageTool: Tool = {
  name: "agent_message",
  description: "Send a message to another agent by name or slug.",
  inputSchema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Target agent name or slug" },
      message: { type: "string", description: "Message content" },
    },
    required: ["to", "message"],
  },
  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const data = (input ?? {}) as { to?: string; message?: string };
    if (!data.to || !data.message) {
      return { ok: false, output: "", error: "to and message are required" };
    }
    return {
      ok: true,
      output: `Message from ${context.agentSlug} to ${data.to}: ${data.message}`,
      data: {
        from: context.agentSlug,
        to: data.to,
        message: data.message,
        queued: true,
      },
    };
  },
};

export const echoTool: Tool = {
  name: "echo",
  description: "Echo input back. Useful for verifying the tool loop.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string" },
    },
    required: ["text"],
  },
  async execute(input: unknown): Promise<ToolResult> {
    const data = (input ?? {}) as { text?: string };
    const text = data.text ?? "";
    return { ok: true, output: text, data: { text } };
  },
};
