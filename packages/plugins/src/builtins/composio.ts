import type { Tool, ToolContext, ToolResult } from "@sora/tools";
import { hasCredential, resolveApiKey } from "../security.ts";
import type {
  ConnectResult,
  PluginSecrets,
  PluginStatus,
  SoraPlugin,
} from "../types.ts";

/**
 * Composio OAuth broker — link Gmail/Slack/GitHub/etc. Key stays local.
 */


const COMPOSIO_BASE =
  process.env.COMPOSIO_BASE_URL?.replace(/\/$/, "") ??
  "https://backend.composio.dev";

function composioKey(secrets: PluginSecrets): string | null {
  return resolveApiKey(secrets, "composio", [
    "COMPOSIO_API_KEY",
    "COMPOSIO_KEY",
  ]);
}

async function composioFetch(
  path: string,
  apiKey: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch(`${COMPOSIO_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
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
  const key = composioKey(secrets);
  if (!key) return [];

  const listAccounts: Tool = {
    name: "composio_list_connections",
    description: "List apps connected through Composio for this project.",
    inputSchema: { type: "object", properties: {} },
    async execute(_input, context): Promise<ToolResult> {
      try {
        await requirePermission(context, `${COMPOSIO_BASE}/api/v2/connectedAccounts`, {
          connector: "composio",
        });
        const apiKey = composioKey(secrets);
        if (!apiKey) {
          return { ok: false, output: "", error: "Composio not configured" };
        }
        // Try v3 then v2 list endpoints for compatibility
        let res = await composioFetch("/api/v3/connected_accounts", apiKey);
        if (!res.ok) {
          res = await composioFetch("/api/v2/connectedAccounts", apiKey);
        }
        if (!res.ok) {
          return {
            ok: false,
            output: "",
            error: `Composio ${res.status}: ${JSON.stringify(res.body)}`,
          };
        }
        const items = Array.isArray(res.body)
          ? res.body
          : (res.body?.items ?? res.body?.data ?? []);
        const lines = (items as any[]).map((a) => {
          const app = a.appName ?? a.appUniqueId ?? a.toolkit?.slug ?? a.app ?? "?";
          const status = a.status ?? a.connectionStatus ?? "unknown";
          const id = a.id ?? a.connectedAccountId ?? "";
          return `${app} · ${status} · ${id}`;
        });
        return {
          ok: true,
          output: lines.length ? lines.join("\n") : "(no connected apps yet)",
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

  const executeAction: Tool = {
    name: "composio_execute",
    description:
      "Execute a Composio action (e.g. GITHUB_CREATE_AN_ISSUE, SLACK_SENDS_A_MESSAGE). Prefer after the user has linked the app.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Composio action name / tool slug",
        },
        params: {
          type: "object",
          description: "Action parameters",
        },
        entityId: {
          type: "string",
          description: "Optional entity / user id (default: default)",
        },
      },
      required: ["action"],
    },
    async execute(input, context): Promise<ToolResult> {
      const data = (input ?? {}) as {
        action?: string;
        params?: Record<string, unknown>;
        entityId?: string;
      };
      if (!data.action?.trim()) {
        return { ok: false, output: "", error: "action is required" };
      }
      try {
        await requirePermission(
          context,
          `${COMPOSIO_BASE}/actions/${data.action}`,
          { connector: "composio", action: data.action },
        );
        const apiKey = composioKey(secrets);
        if (!apiKey) {
          return { ok: false, output: "", error: "Composio not configured" };
        }
        const entityId = data.entityId ?? "default";
        // v2 execute
        let res = await composioFetch(
          `/api/v2/actions/${encodeURIComponent(data.action)}/execute`,
          apiKey,
          {
            method: "POST",
            body: JSON.stringify({
              input: data.params ?? {},
              entityId,
            }),
          },
        );
        if (!res.ok) {
          res = await composioFetch("/api/v3/tools/execute", apiKey, {
            method: "POST",
            body: JSON.stringify({
              tool_slug: data.action,
              arguments: data.params ?? {},
              user_id: entityId,
            }),
          });
        }
        if (!res.ok) {
          return {
            ok: false,
            output: "",
            error: `Composio ${res.status}: ${JSON.stringify(res.body)}`,
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

  return [listAccounts, executeAction];
}

export const composioPlugin: SoraPlugin = {
  id: "composio",
  name: "Composio",
  description:
    "Sign into Gmail, Slack, X, GitHub, and other apps once. Teammates use those connections without seeing your passwords.",
  kind: "connector",
  apps: [
    "gmail",
    "slack",
    "twitter",
    "github",
    "notion",
    "linear",
    "googlecalendar",
    "outlook",
  ],
  privacy:
    "You paste a Composio project key once (stored encrypted on this computer). When you link an app, your browser opens that app’s normal login. App tokens stay with Composio — Sora never stores those passwords.",

  status(secrets): PluginStatus {
    const cred = hasCredential(secrets, "composio", [
      "COMPOSIO_API_KEY",
      "COMPOSIO_KEY",
    ]);
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      kind: this.kind,
      configured: cred.configured,
      hint: cred.hint,
      apps: this.apps,
      privacy: this.privacy,
    };
  },

  tools(secrets) {
    return makeTools(secrets);
  },

  async connect(app, secrets): Promise<ConnectResult> {
    const apiKey = composioKey(secrets);
    if (!apiKey) {
      return {
        ok: false,
        message:
          "Add a Composio API key first (dashboard.composio.dev), then link apps.",
        redirectUrl: "https://app.composio.dev",
      };
    }

    const toolkit = app.trim().toLowerCase() || "github";
    // Initiate connection — try common API shapes
    let res = await composioFetch("/api/v3/connected_accounts", apiKey, {
      method: "POST",
      body: JSON.stringify({
        toolkit: { slug: toolkit },
        auth_config: {},
      }),
    });

    if (!res.ok) {
      res = await composioFetch("/api/v2/connectedAccounts", apiKey, {
        method: "POST",
        body: JSON.stringify({
          appName: toolkit,
          entityId: "default",
        }),
      });
    }

    if (!res.ok) {
      return {
        ok: false,
        message: `Could not start ${toolkit} link (${res.status}). Check the API key and app slug. ${JSON.stringify(res.body)}`,
        redirectUrl: "https://app.composio.dev",
      };
    }

    const redirectUrl =
      res.body?.redirect_url ??
      res.body?.redirectUrl ??
      res.body?.connectionUrl ??
      res.body?.data?.redirect_url ??
      res.body?.data?.redirectUrl;

    const connectionId =
      res.body?.id ??
      res.body?.connectedAccountId ??
      res.body?.data?.id;

    if (typeof redirectUrl === "string") {
      return {
        ok: true,
        redirectUrl,
        connectionId: connectionId ? String(connectionId) : undefined,
        message: `Open the URL to authorize ${toolkit}, then return to Sora.`,
      };
    }

    return {
      ok: true,
      connectionId: connectionId ? String(connectionId) : undefined,
      message: `Connection initiated for ${toolkit}. Finish auth in the Composio dashboard if no redirect was returned.`,
      redirectUrl: "https://app.composio.dev",
    };
  },
};
