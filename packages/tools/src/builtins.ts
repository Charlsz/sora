import type { Tool, ToolContext, ToolResult } from "./types.ts";

/** Phase 1 placeholder: echo HTTP intent without unrestricted network by default. */
export const httpRequestTool: Tool = {
  name: "http_request",
  description:
    "Describe an HTTP request. In Phase 1 this records the intent; real network access is gated in Phase 2 permissions.",
  inputSchema: {
    type: "object",
    properties: {
      method: { type: "string", description: "HTTP method" },
      url: { type: "string", description: "Request URL" },
      body: { type: "string", description: "Optional body" },
    },
    required: ["method", "url"],
  },
  async execute(input: unknown, _context: ToolContext): Promise<ToolResult> {
    const data = (input ?? {}) as { method?: string; url?: string; body?: string };
    if (!data.method || !data.url) {
      return { ok: false, output: "", error: "method and url are required" };
    }
    return {
      ok: true,
      output: `HTTP ${data.method.toUpperCase()} ${data.url} (queued; network execution requires Phase 2 permissions)`,
      data,
    };
  },
};

/** Phase 1: agents can leave notes for other agents (delegation lands in Phase 3). */
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
