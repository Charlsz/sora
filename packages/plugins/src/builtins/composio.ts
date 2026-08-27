import { Composio } from "@composio/core";
import type { Tool, ToolContext, ToolResult } from "@sora/tools";
import { hasCredential, resolveApiKey } from "../security.ts";
import type {
  ConnectResult,
  PluginSecrets,
  PluginStatus,
  SoraPlugin,
} from "../types.ts";

/**
 * Composio Platform connector — sessions API (@composio/core).
 * Single-user desktop identity; Connect Link opens in the browser.
 */

/** Stable local user id for this Sora install (not shared across machines). */
const COMPOSIO_USER_ID =
  process.env.COMPOSIO_USER_ID?.trim() || "sora-local";

/**
 * Toolkits where Composio no longer ships managed OAuth (need a dashboard
 * auth config with the user's own developer app credentials).
 * @see https://docs.composio.dev/kb/guide/toolkits-twitter
 */
const CUSTOM_AUTH_TOOLKITS = new Set(["twitter"]);

const AUTH_CONFIG_HELP: Record<string, string> = {
  twitter:
    "X/Twitter needs your own X Developer app. In dashboard.composio.dev open Auth Configs > Create > Twitter, paste Client ID/Secret (and bearer if asked), then Link X again in Sora.",
};

function composioKey(secrets: PluginSecrets): string | null {
  return resolveApiKey(secrets, "composio", [
    "COMPOSIO_API_KEY",
    "COMPOSIO_KEY",
  ]);
}

function keyLooksLikePlatformProjectKey(apiKey: string): boolean {
  return /^ak_/i.test(apiKey.trim());
}

function formatComposioError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const anyErr = error as Error & {
    status?: number;
    code?: string;
    requestId?: string;
    error?: { message?: string; request_id?: string; code?: string };
  };
  const msg =
    anyErr.error?.message ||
    anyErr.message ||
    "Composio request failed";
  const requestId =
    anyErr.requestId ||
    anyErr.error?.request_id ||
    (/request_id":"([^"]+)"/.exec(msg)?.[1] ?? null);
  const code = anyErr.code || anyErr.error?.code;
  const parts = [msg];
  if (code) parts.push(`code=${code}`);
  if (requestId) parts.push(`request_id=${requestId}`);
  return parts.join(" · ");
}

function client(apiKey: string): Composio {
  return new Composio({ apiKey });
}

function toolkitSlugFromAuthConfig(config: Record<string, unknown>): string | null {
  const toolkit = config.toolkit;
  if (typeof toolkit === "string" && toolkit.trim()) {
    return toolkit.trim().toLowerCase();
  }
  if (toolkit && typeof toolkit === "object") {
    const slug = (toolkit as { slug?: string }).slug;
    if (typeof slug === "string" && slug.trim()) return slug.trim().toLowerCase();
  }
  const appName = config.appName ?? config.app_name;
  if (typeof appName === "string" && appName.trim()) {
    return appName.trim().toLowerCase();
  }
  return null;
}

async function listAuthConfigMap(
  composio: Composio,
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  try {
    const listed = await composio.authConfigs.list({ showDisabled: false });
    for (const item of listed.items ?? []) {
      const row = item as unknown as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : null;
      const slug = toolkitSlugFromAuthConfig(row);
      if (id && slug && !map[slug]) map[slug] = id;
    }
  } catch {
    // Listing is best-effort; connect still works for managed toolkits.
  }
  return map;
}

async function sessionFor(
  apiKey: string,
  authConfigs?: Record<string, string>,
) {
  const composio = client(apiKey);
  // App UI owns connect links; keep manageConnections off so agents don't
  // invent a second OAuth path.
  return composio.create(COMPOSIO_USER_ID, {
    manageConnections: false,
    ...(authConfigs && Object.keys(authConfigs).length
      ? { authConfigs }
      : {}),
  });
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
    description:
      "List apps linked through Composio for this Sora user (active connected accounts).",
    inputSchema: { type: "object", properties: {} },
    async execute(_input, context): Promise<ToolResult> {
      try {
        await requirePermission(context, "composio:toolkits", {
          connector: "composio",
        });
        const apiKey = composioKey(secrets);
        if (!apiKey) {
          return { ok: false, output: "", error: "Composio not configured" };
        }
        if (!keyLooksLikePlatformProjectKey(apiKey)) {
          return {
            ok: false,
            output: "",
            error:
              "Composio key looks invalid. Paste a Platform project API key (starts with ak_) from dashboard.composio.dev > Platform > Getting Started.",
          };
        }
        const composio = client(apiKey);
        const authConfigs = await listAuthConfigMap(composio);
        const session = await sessionFor(apiKey, authConfigs);
        const toolkits = await session.toolkits();
        const items = toolkits.items ?? [];
        const connected = items.filter((t) => t.connection?.isActive);
        return {
          ok: true,
          output: connected.length
            ? connected
                .map((t) => {
                  const id = t.connection?.connectedAccount?.id ?? "";
                  return `${t.slug} · ACTIVE · ${id}`;
                })
                .join("\n")
            : "(no active connections yet — link an app under Connected apps, prefer Gmail/GitHub/Slack first)",
          data: { userId: COMPOSIO_USER_ID, items, authConfigs },
        };
      } catch (error) {
        return {
          ok: false,
          output: "",
          error: formatComposioError(error),
        };
      }
    },
  };

  const searchTools: Tool = {
    name: "composio_search_tools",
    description:
      "Search Composio for real tool slugs for a use case (e.g. send email, list GitHub repos). Use before composio_execute when you do not know the exact slug.",
    inputSchema: {
      type: "object",
      properties: {
        useCase: {
          type: "string",
          description: "What you want to do, in plain language",
        },
      },
      required: ["useCase"],
    },
    async execute(input, context): Promise<ToolResult> {
      const data = (input ?? {}) as { useCase?: string };
      if (!data.useCase?.trim()) {
        return { ok: false, output: "", error: "useCase is required" };
      }
      try {
        await requirePermission(context, "composio:search", {
          connector: "composio",
        });
        const apiKey = composioKey(secrets);
        if (!apiKey) {
          return { ok: false, output: "", error: "Composio not configured" };
        }
        const composio = client(apiKey);
        const authConfigs = await listAuthConfigMap(composio);
        const session = await sessionFor(apiKey, authConfigs);
        const result = await session.execute("COMPOSIO_SEARCH_TOOLS", {
          queries: [{ use_case: data.useCase.trim() }],
        });
        return {
          ok: true,
          output: JSON.stringify(result, null, 2),
          data: result,
        };
      } catch (error) {
        return {
          ok: false,
          output: "",
          error: formatComposioError(error),
        };
      }
    },
  };

  const executeAction: Tool = {
    name: "composio_execute",
    description:
      "Execute a Composio tool by slug (e.g. GITHUB_GET_THE_AUTHENTICATED_USER). Prefer composio_search_tools first if unsure. User must have linked the app.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Composio tool slug",
        },
        params: {
          type: "object",
          description: "Tool arguments",
        },
      },
      required: ["action"],
    },
    async execute(input, context): Promise<ToolResult> {
      const data = (input ?? {}) as {
        action?: string;
        params?: Record<string, unknown>;
      };
      if (!data.action?.trim()) {
        return { ok: false, output: "", error: "action is required" };
      }
      try {
        await requirePermission(context, `composio:execute:${data.action}`, {
          connector: "composio",
          action: data.action,
        });
        const apiKey = composioKey(secrets);
        if (!apiKey) {
          return { ok: false, output: "", error: "Composio not configured" };
        }
        if (!keyLooksLikePlatformProjectKey(apiKey)) {
          return {
            ok: false,
            output: "",
            error:
              "Composio key looks invalid. Paste a Platform project API key (starts with ak_) from dashboard.composio.dev > Platform > Getting Started.",
          };
        }
        const composio = client(apiKey);
        const authConfigs = await listAuthConfigMap(composio);
        const session = await sessionFor(apiKey, authConfigs);
        const result = await session.execute(
          data.action.trim(),
          data.params ?? {},
        );
        const logId =
          (result as { logId?: string; log_id?: string })?.logId ||
          (result as { log_id?: string })?.log_id ||
          null;
        return {
          ok: true,
          output: JSON.stringify(
            logId ? { logId, result } : result,
            null,
            2,
          ),
          data: result,
        };
      } catch (error) {
        return {
          ok: false,
          output: "",
          error: formatComposioError(error),
        };
      }
    },
  };

  return [listAccounts, searchTools, executeAction];
}

export type ComposioConnectionSummary = {
  slug: string;
  status: "ACTIVE" | "inactive";
  id?: string;
};

/** Shared across all teammates — one Sora user id for Composio. */
export async function listComposioConnections(
  secrets: PluginSecrets,
): Promise<ComposioConnectionSummary[]> {
  const apiKey = composioKey(secrets);
  if (!apiKey || !keyLooksLikePlatformProjectKey(apiKey)) return [];
  try {
    const composio = client(apiKey);
    const authConfigs = await listAuthConfigMap(composio);
    const session = await sessionFor(apiKey, authConfigs);
    const toolkits = await session.toolkits();
    return (toolkits.items ?? []).map((t) => ({
      slug: String(t.slug ?? t.name ?? "unknown"),
      status: t.connection?.isActive ? "ACTIVE" : "inactive",
      id: t.connection?.connectedAccount?.id
        ? String(t.connection.connectedAccount.id)
        : undefined,
    }));
  } catch {
    return [];
  }
}

export const composioPlugin: SoraPlugin = {
  id: "composio",
  name: "Composio",
  description:
    "Sign into Gmail, Slack, GitHub, and other apps once. Teammates use those connections without seeing your passwords.",
  kind: "connector",
  // Managed-auth apps first; twitter needs a custom auth config.
  apps: [
    "gmail",
    "github",
    "slack",
    "googlecalendar",
    "notion",
    "linear",
    "outlook",
    "twitter",
  ],
  privacy:
    "You paste a Composio Platform project API key once (starts with ak_, stored encrypted on this computer). When you link an app, your browser opens that app’s normal login. App tokens stay with Composio — Sora never stores those passwords. X/Twitter needs your own X Developer app auth config in the Composio dashboard.",

  status(secrets): PluginStatus {
    const cred = hasCredential(secrets, "composio", [
      "COMPOSIO_API_KEY",
      "COMPOSIO_KEY",
    ]);
    const key = composioKey(secrets);
    const badShape = Boolean(key && !keyLooksLikePlatformProjectKey(key));
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      kind: this.kind,
      configured: cred.configured,
      hint: badShape
        ? "key saved — needs ak_ Platform project key"
        : cred.hint,
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
          "Add a Composio Platform project API key first (dashboard.composio.dev > Platform > Getting Started). Keys start with ak_.",
        redirectUrl: "https://dashboard.composio.dev",
      };
    }
    if (!keyLooksLikePlatformProjectKey(apiKey)) {
      return {
        ok: false,
        message:
          "Saved Composio key is not a Platform project key (expected ak_...). Replace it under Connected apps with the key from dashboard.composio.dev > Platform > Getting Started.",
        redirectUrl: "https://dashboard.composio.dev",
      };
    }

    const toolkit = app.trim().toLowerCase() || "github";
    const authHelpUrl =
      "https://dashboard.composio.dev/~/project/auth-configs";

    try {
      const composio = client(apiKey);
      const authConfigs = await listAuthConfigMap(composio);
      const pinned = authConfigs[toolkit];

      if (CUSTOM_AUTH_TOOLKITS.has(toolkit) && !pinned) {
        return {
          ok: false,
          message:
            AUTH_CONFIG_HELP[toolkit] ??
            `Composio does not manage auth for ${toolkit}. Create an Auth Config for it in the dashboard, then try Link again.`,
          redirectUrl: authHelpUrl,
        };
      }

      const session = await sessionFor(
        apiKey,
        pinned ? { [toolkit]: pinned } : authConfigs,
      );
      const connectionRequest = await session.authorize(toolkit);
      const redirectUrl =
        (connectionRequest as { redirectUrl?: string }).redirectUrl ??
        (connectionRequest as { redirect_url?: string }).redirect_url;
      const connectionId =
        (connectionRequest as { id?: string }).id ??
        (connectionRequest as { connectedAccountId?: string })
          .connectedAccountId ??
        (connectionRequest as { connected_account_id?: string })
          .connected_account_id;

      if (typeof redirectUrl === "string" && redirectUrl) {
        return {
          ok: true,
          redirectUrl,
          connectionId: connectionId ? String(connectionId) : undefined,
          message: `Open the URL to authorize ${toolkit}, then return to Sora.`,
        };
      }

      return {
        ok: false,
        message: `Composio did not return a Connect Link for ${toolkit}. Check the toolkit slug and project key.`,
        redirectUrl: "https://dashboard.composio.dev",
        connectionId: connectionId ? String(connectionId) : undefined,
      };
    } catch (error) {
      const raw = formatComposioError(error);
      if (
        /NoManagedAuth|does not manage auth|auth config/i.test(raw) ||
        CUSTOM_AUTH_TOOLKITS.has(toolkit)
      ) {
        return {
          ok: false,
          message:
            (AUTH_CONFIG_HELP[toolkit]
              ? `${AUTH_CONFIG_HELP[toolkit]} `
              : "") + raw,
          redirectUrl: authHelpUrl,
        };
      }
      return {
        ok: false,
        message: raw,
        redirectUrl: "https://dashboard.composio.dev",
      };
    }
  },
};
