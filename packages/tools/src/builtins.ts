import type { Tool, ToolContext, ToolResult } from "./types.ts";
import { httpRequestTool } from "./http-request.ts";

/** @deprecated use httpRequestTool from http-request.ts */
export { httpRequestTool };

/** Agents can leave notes for other agents (delegation uses delegate_task). */
export const agentMessageTool: Tool = {
  name: "agent_message",
  description:
    "Send a message to another agent by name or slug. Use deliver=run to trigger them immediately.",
  inputSchema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Target agent name or slug" },
      message: { type: "string", description: "Message content" },
      deliver: {
        type: "string",
        description: "queue (default) or run (start agent now)",
      },
    },
    required: ["to", "message"],
  },
  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const data = (input ?? {}) as {
      to?: string;
      message?: string;
      deliver?: string;
    };
    if (!data.to || !data.message) {
      return { ok: false, output: "", error: "to and message are required" };
    }
    if (!context.agentMessaging) {
      return {
        ok: false,
        output: "",
        error: "Agent messaging is not configured",
      };
    }
    const deliver =
      data.deliver?.trim().toLowerCase() === "run" ? "run" : "queue";
    const result = await context.agentMessaging.send({
      to: data.to,
      message: data.message,
      deliver,
    });
    return {
      ok: result.ok,
      output: result.output,
      error: result.error,
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
