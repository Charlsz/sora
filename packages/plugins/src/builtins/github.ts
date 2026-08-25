import type { Tool, ToolContext, ToolResult } from "@sora/tools";
import { hasCredential, resolveApiKey } from "../security.ts";
import type {
  ConnectResult,
  PluginSecrets,
  PluginStatus,
  SoraPlugin,
} from "../types.ts";

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

function githubKey(secrets: PluginSecrets): string | null {
  return resolveApiKey(secrets, "github", ["GITHUB_TOKEN", "GH_TOKEN"]);
}

async function gh(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "sora-runtime",
      "x-github-api-version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep text
  }
  return { ok: res.ok, status: res.status, body };
}

function makeTools(secrets: PluginSecrets): Tool[] {
  const token = githubKey(secrets);
  if (!token) return [];

  const listRepos: Tool = {
    name: "github_list_repos",
    description: "List repositories for the authenticated GitHub user.",
    inputSchema: {
      type: "object",
      properties: {
        per_page: { type: "number", description: "Max repos (default 10)" },
      },
    },
    async execute(input, context): Promise<ToolResult> {
      const data = (input ?? {}) as { per_page?: number };
      const perPage = Math.min(Math.max(data.per_page ?? 10, 1), 50);
      try {
        await requirePermission(context, "https://api.github.com/user/repos", {
          connector: "github",
        });
        const key = githubKey(secrets);
        if (!key) return { ok: false, output: "", error: "GitHub not configured" };
        const res = await gh(`/user/repos?per_page=${perPage}&sort=updated`, key);
        if (!res.ok) {
          return {
            ok: false,
            output: "",
            error: `GitHub ${res.status}: ${JSON.stringify(res.body)}`,
          };
        }
        const repos = res.body as Array<{ full_name: string; private: boolean; html_url: string }>;
        const lines = repos.map(
          (r) => `${r.full_name}${r.private ? " (private)" : ""} ${r.html_url}`,
        );
        return { ok: true, output: lines.join("\n") || "(none)", data: repos };
      } catch (error) {
        return {
          ok: false,
          output: "",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };

  const getIssue: Tool = {
    name: "github_get_issue",
    description: "Get a GitHub issue by owner/repo and number.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        number: { type: "number" },
      },
      required: ["owner", "repo", "number"],
    },
    async execute(input, context): Promise<ToolResult> {
      const data = (input ?? {}) as {
        owner?: string;
        repo?: string;
        number?: number;
      };
      if (!data.owner || !data.repo || data.number === undefined) {
        return { ok: false, output: "", error: "owner, repo, number required" };
      }
      try {
        const path = `/repos/${data.owner}/${data.repo}/issues/${data.number}`;
        await requirePermission(context, `https://api.github.com${path}`, {
          connector: "github",
        });
        const key = githubKey(secrets);
        if (!key) return { ok: false, output: "", error: "GitHub not configured" };
        const res = await gh(path, key);
        if (!res.ok) {
          return {
            ok: false,
            output: "",
            error: `GitHub ${res.status}: ${JSON.stringify(res.body)}`,
          };
        }
        const issue = res.body as {
          title: string;
          state: string;
          body?: string;
          html_url: string;
        };
        return {
          ok: true,
          output: `#${data.number} [${issue.state}] ${issue.title}\n${issue.html_url}\n\n${issue.body ?? ""}`,
          data: issue,
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

  const createIssue: Tool = {
    name: "github_create_issue",
    description: "Create a GitHub issue (requires write scope on the token).",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["owner", "repo", "title"],
    },
    async execute(input, context): Promise<ToolResult> {
      const data = (input ?? {}) as {
        owner?: string;
        repo?: string;
        title?: string;
        body?: string;
      };
      if (!data.owner || !data.repo || !data.title) {
        return { ok: false, output: "", error: "owner, repo, title required" };
      }
      try {
        const path = `/repos/${data.owner}/${data.repo}/issues`;
        await requirePermission(context, `https://api.github.com${path}`, {
          connector: "github",
          write: true,
        });
        const key = githubKey(secrets);
        if (!key) return { ok: false, output: "", error: "GitHub not configured" };
        const res = await gh(path, key, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: data.title, body: data.body ?? "" }),
        });
        if (!res.ok) {
          return {
            ok: false,
            output: "",
            error: `GitHub ${res.status}: ${JSON.stringify(res.body)}`,
          };
        }
        const issue = res.body as { number: number; html_url: string };
        return {
          ok: true,
          output: `Created #${issue.number}: ${issue.html_url}`,
          data: issue,
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

  return [listRepos, getIssue, createIssue];
}

export const githubPlugin: SoraPlugin = {
  id: "github",
  name: "GitHub",
  description:
    "Native GitHub connector via Personal Access Token — no third-party broker.",
  kind: "connector",
  apps: ["github"],
  privacy:
    "Your PAT stays in ~/.sora/secrets.json (or GITHUB_TOKEN env). Calls go directly to api.github.com.",

  status(secrets): PluginStatus {
    const cred = hasCredential(secrets, "github", ["GITHUB_TOKEN", "GH_TOKEN"]);
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

  async connect(_app, secrets): Promise<ConnectResult> {
    if (githubKey(secrets)) {
      return {
        ok: true,
        message:
          "GitHub token already configured. Tools: github_list_repos, github_get_issue, github_create_issue.",
      };
    }
    return {
      ok: false,
      message:
        "Add a classic or fine-grained PAT: Settings → Plugins → GitHub, or: sora provider set github --key ghp_… (repo scope).",
      redirectUrl: "https://github.com/settings/tokens",
    };
  },
};
