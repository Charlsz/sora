import { getPaths, loadSecrets, saveSecrets } from "@sora/core";
import type { Tool, ToolContext, ToolResult } from "@sora/tools";
import {
  loadCatalog,
  mirrorFullFeed,
  searchLocal,
  syncCatalog,
} from "./botdirectory-cache.ts";
import {
  BOTDIRECTORY_CATEGORIES,
  BOTDIRECTORY_SITE,
  listBots,
  publishBot,
  sendFeedback,
  signup,
  subscribeNewsletter,
  whoAmI,
} from "./botdirectory-client.ts";
import { hasCredential, resolveApiKey } from "../security.ts";
import type {
  ConnectResult,
  PluginSecrets,
  PluginStatus,
  SoraPlugin,
} from "../types.ts";

/**
 * botdirectory.ai — curated bot prompts directory.
 * Reads are keyless; writes use a signup password stored in ~/.sora/secrets.json.
 * Contract: https://botdirectory.ai/api/
 */

const ENV_KEYS = ["BOTDIRECTORY_PASSWORD", "BOTDIRECTORY_API_KEY"];

function password(secrets: PluginSecrets): string | null {
  return resolveApiKey(secrets, "botdirectory", ENV_KEYS);
}

function usernameOf(secrets: PluginSecrets): string | null {
  return secrets.providers.botdirectory?.username?.trim() || null;
}

function catalogPath(): string {
  return getPaths().botdirectoryCatalog;
}

/** Persist write password locally; mutates in-memory secrets for hot use. */
function persistWritePassword(
  secrets: PluginSecrets,
  username: string,
  apiKey: string,
): void {
  const next = {
    ...(secrets.providers.botdirectory ?? {}),
    apiKey,
    username,
  };
  secrets.providers.botdirectory = next;
  const path = getPaths().secrets;
  const disk = loadSecrets(path);
  disk.providers.botdirectory = next;
  saveSecrets(path, disk);
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
    detail: { connector: "botdirectory", ...detail },
  });
}

function ok(output: string, data?: unknown): ToolResult {
  return { ok: true, output, data };
}

function fail(error: string): ToolResult {
  return { ok: false, output: "", error };
}

function makeTools(secrets: PluginSecrets): Tool[] {
  const tools: Tool[] = [];

  tools.push({
    name: "botdirectory_search",
    description:
      "Search botdirectory.ai curated bots (local mirror first, live API fallback). Keyless. Prefer this before inventing a bot prompt. Categories: " +
      BOTDIRECTORY_CATEGORIES.join(", ") +
      ".",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search query" },
        category: {
          type: "string",
          description: `Exact category: ${BOTDIRECTORY_CATEGORIES.join(", ")}`,
        },
        integration: {
          type: "string",
          description: "Exact integration name e.g. Slack",
        },
        limit: { type: "number", description: "Max results (default 10)" },
        live: {
          type: "boolean",
          description: "Force live API instead of local cache",
        },
      },
    },
    async execute(input, context): Promise<ToolResult> {
      const data = (input ?? {}) as {
        q?: string;
        category?: string;
        integration?: string;
        limit?: number;
        live?: boolean;
      };
      const limit = Math.min(Math.max(data.limit ?? 10, 1), 50);
      try {
        await requirePermission(
          context,
          `${BOTDIRECTORY_SITE}/api/bots`,
          { op: "search" },
        );
        const catalog = loadCatalog(catalogPath());
        let bots = data.live
          ? []
          : searchLocal(catalog, { ...data, limit });
        let source: "local" | "live" = "local";
        if (data.live || bots.length === 0) {
          const live = await listBots({
            q: data.q,
            category: data.category,
            integration: data.integration,
            limit,
            sort: "newest",
          });
          bots = live.bots;
          source = "live";
        }
        const lines = bots.map(
          (b) =>
            `${b.slug} · ${b.category} · ${b.name}\n  integrations: ${b.integrations.join(", ") || "—"}\n  ${b.detailUrl}`,
        );
        return ok(
          bots.length
            ? `Found ${bots.length} (${source}):\n\n${lines.join("\n\n")}`
            : "No bots matched.",
          { source, bots },
        );
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  });

  tools.push({
    name: "botdirectory_get",
    description:
      "Fetch one botdirectory listing by slug (prompt + metadata). Use before cloning a setup into a Sora agent.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Bot slug" },
      },
      required: ["slug"],
    },
    async execute(input, context): Promise<ToolResult> {
      const slug = String((input as { slug?: string })?.slug ?? "").trim();
      if (!slug) return fail("slug required");
      try {
        await requirePermission(
          context,
          `${BOTDIRECTORY_SITE}/bots/${slug}`,
          { op: "get" },
        );
        const local = loadCatalog(catalogPath()).bots[slug];
        if (local) {
          return ok(
            JSON.stringify(local, null, 2),
            local,
          );
        }
        const live = await listBots({ q: slug, limit: 25, sort: "name" });
        const hit =
          live.bots.find((b) => b.slug === slug) ??
          live.bots.find((b) => b.slug.includes(slug));
        if (!hit) return fail(`Bot "${slug}" not found locally or live`);
        return ok(JSON.stringify(hit, null, 2), hit);
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  });

  tools.push({
    name: "botdirectory_sync",
    description:
      "Append-safe sync of botdirectory.ai into ~/.sora/botdirectory/catalog.json (cursor mode). Call periodically to keep a local mirror.",
    inputSchema: {
      type: "object",
      properties: {
        maxPages: {
          type: "number",
          description: "Pages this call (default 3, 100 bots each)",
        },
        full: {
          type: "boolean",
          description: "One-shot replace from bots.json instead of cursor",
        },
        reset: {
          type: "boolean",
          description: "Restart cursor sync from the beginning",
        },
      },
    },
    async execute(input, context): Promise<ToolResult> {
      const data = (input ?? {}) as {
        maxPages?: number;
        full?: boolean;
        reset?: boolean;
      };
      try {
        await requirePermission(
          context,
          `${BOTDIRECTORY_SITE}/api/bots`,
          { op: "sync" },
        );
        if (data.full) {
          const n = await mirrorFullFeed(catalogPath());
          return ok(`Mirrored ${n} bots from bots.json`, { total: n });
        }
        const result = await syncCatalog(catalogPath(), {
          maxPages: data.maxPages ?? 3,
          reset: data.reset,
        });
        return ok(
          `Sync: +${result.added} new · ${result.total} total · hasMore=${result.hasMore}`,
          result,
        );
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  });

  tools.push({
    name: "botdirectory_subscribe_newsletter",
    description:
      "Subscribe a known user email to botdirectory.ai curated drops. NEVER invent an email — only call when the user already gave you their address.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "User's known email" },
      },
      required: ["email"],
    },
    async execute(input, context): Promise<ToolResult> {
      const email = String((input as { email?: string })?.email ?? "")
        .trim()
        .toLowerCase();
      if (!email.includes("@")) return fail("valid email required");
      try {
        await requirePermission(
          context,
          `${BOTDIRECTORY_SITE}/api/newsletter`,
          { op: "newsletter" },
        );
        const result = await subscribeNewsletter(email, "bot");
        return ok(`Subscribed ${email} to botdirectory drops.`, result);
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  });

  tools.push({
    name: "botdirectory_signup",
    description:
      "Sign up a botdirectory.ai write account (username 3–32 chars). Password is stored once in ~/.sora/secrets.json and never echoed back.",
    inputSchema: {
      type: "object",
      properties: {
        username: {
          type: "string",
          description: "Slug-like handle, 3–32 characters",
        },
      },
      required: ["username"],
    },
    async execute(input, context): Promise<ToolResult> {
      const username = String(
        (input as { username?: string })?.username ?? "",
      )
        .trim()
        .toLowerCase();
      if (username.length < 3 || username.length > 32) {
        return fail("username must be 3–32 characters");
      }
      try {
        await requirePermission(
          context,
          `${BOTDIRECTORY_SITE}/api/signup`,
          { op: "signup" },
        );
        const result = await signup(username);
        persistWritePassword(secrets, result.username, result.password);
        return ok(
          `Signed up as @${result.username}. Write password saved locally (not shown). You can publish and leave feedback now.`,
          { username: result.username },
        );
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  });

  tools.push({
    name: "botdirectory_me",
    description: "Check which botdirectory account the stored write password belongs to.",
    inputSchema: { type: "object", properties: {} },
    async execute(_input, context): Promise<ToolResult> {
      const key = password(secrets);
      if (!key) {
        return fail(
          "No botdirectory password. Sign up via botdirectory_signup or save one in Plugins.",
        );
      }
      try {
        await requirePermission(context, `${BOTDIRECTORY_SITE}/api/me`, {
          op: "me",
        });
        const me = await whoAmI(key);
        const localUser = usernameOf(secrets);
        return ok(
          JSON.stringify({ ...me, storedUsername: localUser }, null, 2),
          me,
        );
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  });

  tools.push({
    name: "botdirectory_publish",
    description:
      "Open a PR on elie222/botdirectory.ai that adds a bot listing. Requires a stored write password. Category must be one of the curated set. Integrations are tool names the prompt connects.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        category: {
          type: "string",
          description: BOTDIRECTORY_CATEGORIES.join(", "),
        },
        prompt: { type: "string", description: "Prompt body, verbatim" },
        integrations: {
          type: "array",
          items: { type: "string" },
          description: "Tool / app names e.g. [\"Slack\",\"Notion\"]",
        },
        url: {
          type: "string",
          description: "Canonical homepage (dedupe key)",
        },
        contributorUrl: { type: "string" },
      },
      required: ["name", "category", "prompt", "integrations"],
    },
    async execute(input, context): Promise<ToolResult> {
      const key = password(secrets);
      if (!key) {
        return fail("No botdirectory write password configured");
      }
      const data = (input ?? {}) as {
        name?: string;
        category?: string;
        prompt?: string;
        integrations?: string[];
        url?: string;
        contributorUrl?: string;
      };
      if (!data.name?.trim() || !data.prompt?.trim() || !data.category?.trim()) {
        return fail("name, category, and prompt are required");
      }
      const integrations = Array.isArray(data.integrations)
        ? data.integrations.map(String)
        : [];
      if (!integrations.length) return fail("integrations array required");
      try {
        await requirePermission(context, `${BOTDIRECTORY_SITE}/api/bots`, {
          op: "publish",
        });
        const result = await publishBot(key, {
          name: data.name.trim(),
          category: data.category.trim(),
          prompt: data.prompt,
          integrations,
          url: data.url,
          contributorUrl: data.contributorUrl,
          addedVia: "sora",
        });
        return ok(
          `PR opened: ${result.prUrl}\nslug=${result.slug} branch=${result.branch}`,
          result,
        );
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  });

  tools.push({
    name: "botdirectory_feedback",
    description:
      "Leave feedback on a botdirectory listing (works/broken/spam/other).",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        message: { type: "string" },
        kind: {
          type: "string",
          description: "works | broken | spam | other",
        },
        rating: { type: "number", description: "1–5" },
      },
      required: ["slug", "message"],
    },
    async execute(input, context): Promise<ToolResult> {
      const key = password(secrets);
      if (!key) return fail("No botdirectory write password configured");
      const data = (input ?? {}) as {
        slug?: string;
        message?: string;
        kind?: "works" | "broken" | "spam" | "other";
        rating?: number;
      };
      if (!data.slug?.trim() || !data.message?.trim()) {
        return fail("slug and message required");
      }
      try {
        await requirePermission(
          context,
          `${BOTDIRECTORY_SITE}/api/feedback`,
          { op: "feedback" },
        );
        const result = await sendFeedback(key, {
          slug: data.slug.trim(),
          message: data.message.trim(),
          kind: data.kind,
          rating: data.rating,
        });
        return ok("Feedback submitted.", result);
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  });

  return tools;
}

export const botdirectoryPlugin: SoraPlugin = {
  id: "botdirectory",
  name: "Bot Directory",
  description:
    "Browse, sync, import, and publish to botdirectory.ai — curated bot prompts with a public API.",
  kind: "connector",
  apps: ["search", "sync", "publish"],
  privacy:
    "Catalog reads are keyless. Write password (if any) stays in ~/.sora/secrets.json. Local mirror: ~/.sora/botdirectory/.",

  status(secrets): PluginStatus {
    const cred = hasCredential(secrets, "botdirectory", ENV_KEYS);
    const catalog = loadCatalog(catalogPath());
    const count = Object.keys(catalog.bots).length;
    const user = usernameOf(secrets);
    const hintParts: string[] = [];
    if (cred.configured) {
      hintParts.push(user ? `@${user}` : cred.hint ?? "linked");
    }
    if (count) hintParts.push(`${count} cached`);
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      kind: this.kind,
      // Readable without credentials — "configured" means write-ready.
      configured: cred.configured,
      hint: hintParts.length ? hintParts.join(" · ") : "reads work without a key",
      apps: this.apps,
      privacy: this.privacy,
    };
  },

  tools(secrets) {
    return makeTools(secrets);
  },

  async connect(app, _secrets): Promise<ConnectResult> {
    if (app === "search" || app === "sync") {
      return {
        ok: true,
        message:
          "Search/sync need no key. Use botdirectory_sync or Plugins → Sync catalog.",
      };
    }
    return {
      ok: true,
      message:
        "Sign up at Plugins → Bot Directory (or botdirectory_signup), then save the one-time password locally.",
      redirectUrl: `${BOTDIRECTORY_SITE}/api/`,
    };
  },
};
