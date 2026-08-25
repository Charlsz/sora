import {
  getPaths,
  loadOpenApiConfig,
  type OpenApiSpecConfig,
} from "@sora/core";
import type { Tool, ToolContext, ToolResult } from "@sora/tools";
import {
  loadOpenApiDocument,
  parseOpenApiOperations,
} from "./openapi-parser.ts";
import type { PluginSecrets, PluginStatus, SoraPlugin } from "../types.ts";

let cached: Tool[] = [];

function slugify(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeTool(
  spec: OpenApiSpecConfig,
  baseUrl: string,
  op: ReturnType<typeof parseOpenApiOperations>[number],
): Tool {
  const prefix = `openapi_${slugify(spec.id)}`;
  const name = `${prefix}_${slugify(op.operationId)}`.slice(0, 64);
  return {
    name,
    description: `[${spec.name}] ${op.summary}`,
    inputSchema: op.parameters,
    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
      const args = (input ?? {}) as Record<string, unknown>;
      let path = op.path;
      for (const [key, value] of Object.entries(args)) {
        if (key === "body") continue;
        path = path.replace(
          `{${key}}`,
          encodeURIComponent(String(value ?? "")),
        );
      }
      const url = new URL(path, baseUrl.replace(/\/$/, "") + "/");
      const method = op.method;
      const headers: Record<string, string> = {
        accept: "application/json",
        "user-agent": "sora-openapi/0.1",
      };
      let body: string | undefined;
      if (args.body !== undefined && method !== "GET" && method !== "HEAD") {
        body = String(args.body);
        headers["content-type"] = "application/json";
      }

      if (context.permissions) {
        await context.permissions.assert({
          agentId: context.agentId,
          agentSlug: context.agentSlug,
          action: "http.request",
          resource: url.toString(),
          detail: { openapi: spec.id, operation: op.operationId, method },
        });
      }

      try {
        const res = await fetch(url.toString(), { method, headers, body });
        const text = (await res.text()).slice(0, 512 * 1024);
        return {
          ok: res.ok,
          output: `${res.status} ${res.statusText}\n${text}`,
          error: res.ok ? undefined : `HTTP ${res.status}`,
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
}

export const openapiPlugin: SoraPlugin = {
  id: "openapi",
  name: "OpenAPI",
  description:
    "Import REST APIs from OpenAPI 3 specs as agent tools (~/.sora/openapi.json).",
  kind: "connector",
  apps: ["rest"],
  privacy: "Specs and calls stay local. HTTP requires permission approval.",

  status(_secrets): PluginStatus {
    const cfg = loadOpenApiConfig(getPaths().openapi);
    const enabled = cfg.specs.filter((s) => s.enabled !== false);
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      kind: this.kind,
      configured: enabled.length > 0,
      hint: enabled.length
        ? `${enabled.length} spec${enabled.length === 1 ? "" : "s"} · ${cached.length} tools`
        : null,
      apps: this.apps,
      privacy: this.privacy,
    };
  },

  tools(_secrets) {
    return cached;
  },

  async refresh(_secrets) {
    const paths = getPaths();
    const cfg = loadOpenApiConfig(paths.openapi);
    const tools: Tool[] = [];
    for (const spec of cfg.specs) {
      if (spec.enabled === false) continue;
      try {
        const doc = await loadOpenApiDocument(spec.spec, paths.home);
        const servers = doc.servers as Array<{ url?: string }> | undefined;
        const baseUrl =
          spec.baseUrl?.trim() ||
          servers?.[0]?.url?.trim() ||
          "http://localhost";
        for (const op of parseOpenApiOperations(doc)) {
          tools.push(makeTool(spec, baseUrl, op));
        }
      } catch {
        // Skip broken specs; status still shows configured count.
      }
    }
    cached = tools;
  },
};
