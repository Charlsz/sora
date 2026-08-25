import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServerConfig } from "@sora/core";
import type { Tool, ToolResult } from "@sora/tools";

type LiveSession = {
  client: Client;
  serverId: string;
};

const sessions = new Map<string, LiveSession>();

function slug(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
}

async function closeSession(serverId: string): Promise<void> {
  const existing = sessions.get(serverId);
  if (!existing) return;
  sessions.delete(serverId);
  try {
    await existing.client.close();
  } catch {
    // ignore teardown errors
  }
}

/** Drop all live MCP processes / HTTP sessions (before reload). */
export async function closeAllMcpSessions(): Promise<void> {
  const ids = [...sessions.keys()];
  await Promise.all(ids.map((id) => closeSession(id)));
}

async function connectServer(server: McpServerConfig): Promise<Client | null> {
  await closeSession(server.id);

  let transport;
  if (server.transport === "stdio") {
    if (!server.command?.trim()) return null;
    transport = new StdioClientTransport({
      command: server.command,
      args: server.args ?? [],
      env: { ...process.env, ...(server.env ?? {}) } as Record<string, string>,
      stderr: "pipe",
    });
  } else if (server.transport === "http") {
    if (!server.url?.trim()) return null;
    transport = new StreamableHTTPClientTransport(new URL(server.url), {
      requestInit: server.headers
        ? { headers: server.headers }
        : undefined,
    });
  } else {
    return null;
  }

  const client = new Client({ name: "sora", version: "0.1.0" });
  await client.connect(transport);
  sessions.set(server.id, { client, serverId: server.id });
  return client;
}

function contentToText(content: unknown): string {
  if (!Array.isArray(content)) return JSON.stringify(content);
  return content
    .map((c) =>
      c && typeof c === "object" && "text" in c
        ? String((c as { text: string }).text)
        : JSON.stringify(c),
    )
    .join("\n");
}

/** Discover tools from one MCP server; keeps the session open for execute. */
export async function discoverMcpTools(
  server: McpServerConfig,
): Promise<Tool[]> {
  if (server.enabled === false) {
    await closeSession(server.id);
    return [];
  }

  let client: Client;
  try {
    const connected = await connectServer(server);
    if (!connected) return [];
    client = connected;
  } catch (error) {
    console.error(
      `MCP ${server.id}:`,
      error instanceof Error ? error.message : error,
    );
    await closeSession(server.id);
    return [];
  }

  try {
    const listed = await client.listTools();
    const prefix = `mcp_${slug(server.id)}`;
    return (listed.tools ?? []).map((meta) => {
      const name = `${prefix}_${slug(meta.name)}`;
      const tool: Tool = {
        name,
        description: `[MCP:${server.name}] ${meta.description ?? meta.name}`,
        inputSchema: (meta.inputSchema as Tool["inputSchema"]) ?? {
          type: "object",
          properties: {},
        },
        async execute(input, context): Promise<ToolResult> {
          try {
            if (context.permissions) {
              await context.permissions.assert({
                agentId: context.agentId,
                agentSlug: context.agentSlug,
                action: "http.request",
                resource: `mcp://${server.id}/${meta.name}`,
                detail: { connector: "mcp", server: server.id },
              });
            }
            const live = sessions.get(server.id)?.client ?? client;
            const result = await live.callTool({
              name: meta.name,
              arguments: (input ?? {}) as Record<string, unknown>,
            });
            const text = contentToText(result.content);
            return {
              ok: !result.isError,
              output: text,
              error: result.isError ? text : undefined,
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
      return tool;
    });
  } catch (error) {
    console.error(
      `MCP ${server.id} listTools:`,
      error instanceof Error ? error.message : error,
    );
    await closeSession(server.id);
    return [];
  }
}
