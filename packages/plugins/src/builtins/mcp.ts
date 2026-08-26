import {
  getPaths,
  loadMcpConfig,
  type McpServerConfig,
} from "@sora/core";
import type { Tool } from "@sora/tools";
import { discoverMcpTools } from "./mcp-client.ts";
import type {
  ConnectResult,
  PluginSecrets,
  PluginStatus,
  SoraPlugin,
} from "../types.ts";

let cached: Tool[] = [];
let lastCount = 0;

/**
 * User-installed MCP servers (stdio). External tool integrations,
 * local-first — config in ~/.sora/mcp.json, no cloud account required.
 */
export const mcpPlugin: SoraPlugin = {
  id: "mcp",
  name: "MCP",
  description:
    "Connect Model Context Protocol servers (stdio). Import any MCP tool catalog.",
  kind: "mcp",
  apps: ["stdio"],
  privacy:
    "Server commands run on your machine. Config lives in ~/.sora/mcp.json (mode 0600).",

  status(_secrets): PluginStatus {
    const cfg = loadMcpConfig(getPaths().mcp);
    const enabled = cfg.servers.filter((s) => s.enabled !== false);
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      kind: this.kind,
      configured: enabled.length > 0,
      hint: enabled.length
        ? `${enabled.length} server${enabled.length === 1 ? "" : "s"} · ${lastCount} tools`
        : null,
      apps: this.apps,
      privacy: this.privacy,
    };
  },

  tools(_secrets) {
    return cached;
  },

  async refresh(_secrets) {
    const cfg = loadMcpConfig(getPaths().mcp);
    const tools: Tool[] = [];
    for (const server of cfg.servers) {
      if (server.enabled === false) continue;
      tools.push(...(await discoverMcpTools(server)));
    }
    cached = tools;
    lastCount = tools.length;
  },

  async connect(app, _secrets): Promise<ConnectResult> {
    if (app === "stdio" || !app) {
      return {
        ok: true,
        message:
          "Add a server via API/UI (command + args), e.g. npx -y @modelcontextprotocol/server-filesystem <path>.",
      };
    }
    return { ok: false, message: `Unknown MCP connect target: ${app}` };
  },
};

export type { McpServerConfig };
