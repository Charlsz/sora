import type { Tool, ToolContext, ToolResult } from "@sora/tools";
import { hasCredential, resolveApiKey } from "../security.ts";
import type {
  ConnectResult,
  PluginSecrets,
  PluginStatus,
  SoraPlugin,
} from "../types.ts";

const PIPEDREAM_BASE =
  process.env.PIPEDREAM_BASE_URL?.replace(/\/$/, "") ??
  "https://api.pipedream.com/v1";

function pipedreamKey(secrets: PluginSecrets): string | null {
  return resolveApiKey(secrets, "pipedream", [
    "PIPEDREAM_API_KEY",
    "PIPEDREAM_API_TOKEN",
  ]);
}

async function pdFetch(
  path: string,
  apiKey: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch(`${PIPEDREAM_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep
  }
  return { ok: res.ok, status: res.status, body };
}

async function requirePermission(
  context: ToolContext,
  resource: string,
  detail?: Record<string, unknown>,
) {
  if (!context.permissions) return;
  await context.permissions.assert({
    agentId: context.agentId,
    agentSlug: context.agentSlug,
    action: "http.request",
    resource,
    detail,
  });
}

function makeTools(secrets: PluginSecrets): Tool[] {
  const key = pipedreamKey(secrets);
  if (!key) return [];

  const listAccounts: Tool = {
    name: "pipedream_list_accounts",
    description: "List connected Pipedream accounts for this workspace.",
    inputSchema: { type: "object", properties: {} },
    async execute(_input, context): Promise<ToolResult> {
      try {
        await requirePermission(context, `${PIPEDREAM_BASE}/accounts`, {
          connector: "pipedream",
        });
        const apiKey = pipedreamKey(secrets);
        if (!apiKey) {
          return { ok: false, output: "", error: "Pipedream not configured" };
        }
        const res = await pdFetch("/accounts", apiKey);
        if (!res.ok) {
          return {
            ok: false,
            output: "",
            error: `Pipedream ${res.status}: ${JSON.stringify(res.body)}`,
          };
        }
        const items = Array.isArray(res.body?.data)
          ? res.body.data
          : (res.body?.items ?? []);
        const lines = (items as any[]).map((a) => {
          const app = a.app?.name_slug ?? a.app ?? "?";
          return `${app} · ${a.id ?? a.external_id ?? ""}`;
        });
        return {
          ok: true,
          output: lines.length ? lines.join("\n") : "(no connected accounts)",
          data: items,
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

  const invoke: Tool = {
    name: "pipedream_invoke",
    description:
      "Invoke a Pipedream action by component key with props JSON. Requires a linked account.",
    inputSchema: {
      type: "object",
      properties: {
        component: {
          type: "string",
          description: "Component key / action id",
        },
        props: {
          type: "object",
          description: "Action props",
        },
      },
      required: ["component"],
    },
    async execute(input, context): Promise<ToolResult> {
      const data = (input ?? {}) as {
        component?: string;
        props?: Record<string, unknown>;
      };
      const component = data.component?.trim();
      if (!component) {
        return { ok: false, output: "", error: "component is required" };
      }
      try {
        await requirePermission(context, `${PIPEDREAM_BASE}/components/run`, {
          connector: "pipedream",
          component,
        });
        const apiKey = pipedreamKey(secrets);
        if (!apiKey) {
          return { ok: false, output: "", error: "Pipedream not configured" };
        }
        const res = await pdFetch("/components/run", apiKey, {
          method: "POST",
          body: JSON.stringify({
            component,
            props: data.props ?? {},
          }),
        });
        if (!res.ok) {
          return {
            ok: false,
            output: "",
            error: `Pipedream ${res.status}: ${JSON.stringify(res.body)}`,
          };
        }
        return {
          ok: true,
          output: JSON.stringify(res.body, null, 2),
          data: res.body,
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

  return [listAccounts, invoke];
}

export const pipedreamPlugin: SoraPlugin = {
  id: "pipedream",
  name: "Pipedream",
  description:
    "Connect SaaS apps via Pipedream Connect (optional alongside Composio).",
  kind: "connector",
  apps: [
    "slack",
    "github",
    "google_sheets",
    "notion",
    "airtable",
    "discord",
  ],
  privacy:
    "API key stored in ~/.sora/secrets.json. OAuth links open in your browser.",

  status(secrets): PluginStatus {
    const key = pipedreamKey(secrets);
    const fromEnv = Boolean(
      process.env.PIPEDREAM_API_KEY || process.env.PIPEDREAM_API_TOKEN,
    );
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      kind: this.kind,
      configured: Boolean(key),
      hint: key
        ? fromEnv
          ? "from env"
          : "key saved locally"
        : "Set PIPEDREAM_API_KEY or save in Plugins",
      apps: this.apps,
      privacy: this.privacy,
    };
  },

  tools(secrets) {
    return makeTools(secrets);
  },

  async connect(app, secrets): Promise<ConnectResult> {
    if (!hasCredential(secrets, "pipedream")) {
      return {
        ok: false,
        message:
          "Save a Pipedream API key first (Plugins → Pipedream or sora provider set pipedream).",
      };
    }
    const toolkit = app?.trim() || "slack";
    return {
      ok: true,
      redirectUrl: `https://pipedream.com/apps/${toolkit}`,
      message: `Open Pipedream to connect ${toolkit}, then use pipedream_list_accounts to verify.`,
    };
  },
};
