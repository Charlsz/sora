import type { Tool, ToolContext, ToolResult } from "./types.ts";
import { httpRequestTool } from "./http-request.ts";

/** @deprecated use httpRequestTool from http-request.ts */
export { httpRequestTool };

/** Talk to another teammate. Defaults to running them now so the user sees the exchange. */
export const agentMessageTool: Tool = {
  name: "agent_message",
  description:
    "Send a message to another teammate by name or slug. By default they run immediately and you get their reply. Use deliver=queue only to leave a note without waking them.",
  inputSchema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Target agent name or slug" },
      message: { type: "string", description: "Message content" },
      deliver: {
        type: "string",
        description: "run (default: wake them now) or queue (inbox only)",
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
    const raw = data.deliver?.trim().toLowerCase();
    const deliver = raw === "queue" ? "queue" : "run";
    const result = await context.agentMessaging.send({
      to: data.to,
      message: data.message,
      deliver,
    });
    return {
      ok: result.ok,
      output: result.output,
      error: result.error,
      data: result.data,
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
