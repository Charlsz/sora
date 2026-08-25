import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type McpServerConfig = {
  id: string;
  name: string;
  /** stdio: local process · http: remote MCP endpoint */
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  /** Optional bearer / header for remote MCP (never returned raw by API). */
  headers?: Record<string, string>;
  enabled?: boolean;
};

export type McpConfigFile = {
  version: 1;
  servers: McpServerConfig[];
  updatedAt: string;
};

export const EMPTY_MCP_CONFIG = (): McpConfigFile => ({
  version: 1,
  servers: [],
  updatedAt: new Date().toISOString(),
});

export function loadMcpConfig(path: string): McpConfigFile {
  if (!existsSync(path)) return EMPTY_MCP_CONFIG();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as McpConfigFile;
    return {
      version: 1,
      servers: Array.isArray(raw.servers) ? raw.servers : [],
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return EMPTY_MCP_CONFIG();
  }
}

export function saveMcpConfig(path: string, config: McpConfigFile): void {
  mkdirSync(dirname(path), { recursive: true });
  const next: McpConfigFile = {
    version: 1,
    servers: config.servers,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
}

/** Safe for API/UI — strips header values. */
export function publicMcpServers(config: McpConfigFile) {
  return config.servers.map((s) => ({
    id: s.id,
    name: s.name,
    transport: s.transport,
    command: s.command,
    args: s.args,
    url: s.url,
    enabled: s.enabled !== false,
    hasHeaders: Boolean(s.headers && Object.keys(s.headers).length),
  }));
}
