import type { Tool, ToolContext, ToolResult } from "./types.ts";

const MAX_BODY = 256 * 1024;
const MAX_RESPONSE = 512 * 1024;
const TIMEOUT_MS = 30_000;

/** Outbound HTTP with PermissionGate (http.request). */
export const httpRequestTool: Tool = {
  name: "http_request",
  description:
    "Send an HTTP request (GET, POST, PUT, PATCH, DELETE). Requires permission approval for external URLs.",
  inputSchema: {
    type: "object",
    properties: {
      method: {
        type: "string",
        description: "HTTP method (GET, POST, PUT, PATCH, DELETE)",
      },
      url: { type: "string", description: "Request URL (https recommended)" },
      headers: {
        type: "object",
        description: "Optional headers (string values)",
      },
      body: { type: "string", description: "Optional request body" },
    },
    required: ["method", "url"],
  },
  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const data = (input ?? {}) as {
      method?: string;
      url?: string;
      headers?: Record<string, string>;
      body?: string;
    };
    const method = data.method?.trim().toUpperCase();
    const urlStr = data.url?.trim();
    if (!method || !urlStr) {
      return { ok: false, output: "", error: "method and url are required" };
    }

    let url: URL;
    try {
      url = new URL(urlStr);
    } catch {
      return { ok: false, output: "", error: `Invalid URL: ${urlStr}` };
    }

    if (!["HTTP:", "HTTPS:"].includes(url.protocol.toUpperCase())) {
      return {
        ok: false,
        output: "",
        error: "Only http and https URLs are supported",
      };
    }

    if (context.permissions) {
      await context.permissions.assert({
        agentId: context.agentId,
        agentSlug: context.agentSlug,
        action: "http.request",
        resource: url.toString(),
        detail: { method, host: url.hostname },
      });
    }

    const headers: Record<string, string> = {
      "user-agent": "sora-runtime/0.1",
      accept: "application/json, text/plain, */*",
      ...(data.headers ?? {}),
    };

    const body =
      data.body && method !== "GET" && method !== "HEAD"
        ? data.body.slice(0, MAX_BODY)
        : undefined;

    try {
      const res = await fetch(url.toString(), {
        method,
        headers,
        body,
        signal: context.signal ?? AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = (await res.text()).slice(0, MAX_RESPONSE);
      const summary = `${res.status} ${res.statusText}\n${text}`;
      return {
        ok: res.ok,
        output: summary,
        error: res.ok ? undefined : `HTTP ${res.status}`,
        data: {
          status: res.status,
          statusText: res.statusText,
          url: url.toString(),
          body: text,
        },
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
