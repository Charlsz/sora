export type Agent = {
  id: string;
  slug: string;
  name: string;
  description: string;
  instructions: string;
  model: string;
  tools: Array<{ name: string }>;
  skills: Array<{ name: string }>;
  capabilities: string[];
  status: string;
  workspace?: string;
};

export type Skill = {
  id: string;
  name: string;
  description: string;
  tools: string[];
};

export type Workflow = {
  id: string;
  slug: string;
  name: string;
  agentSlug: string;
  skill?: string;
  task: string;
  trigger: { type: string; expression?: string; path?: string };
  enabled: boolean;
};

export type ConversationMessage = {
  id: string;
  role: string;
  content: string;
  toolName?: string;
  createdAt: string;
};

export type PendingPermission = {
  requestId: string;
  agentId: string;
  agentSlug: string;
  action: string;
  resource: string;
  detail?: Record<string, unknown>;
  createdAt: string;
};

export type ProviderInfo = {
  id: string;
  name: string;
  description: string;
  configured: boolean;
  fromEnv: boolean;
  needsKey: boolean;
  baseUrl: string;
  hint: string | null;
};

export type PluginStatus = {
  id: string;
  name: string;
  description: string;
  kind: string;
  configured: boolean;
  hint: string | null;
  apps: string[];
  privacy: string;
};

export type ComputerInfo = {
  agentSlug: string;
  workspaceRoot: string;
  kind: string;
  browser: {
    backend: string;
    open: boolean;
    url: string;
    title: string;
    profileDir?: string;
    headed: boolean;
  };
};

export type SoraEvent = {
  id: string;
  type: string;
  timestamp: number;
  data?: Record<string, unknown>;
};

export type LiveEntry =
  | { kind: "user"; id: string; content: string }
  | { kind: "assistant"; id: string; content: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      status: "started" | "completed" | "failed";
      detail?: string;
    }
  | { kind: "event"; id: string; type: string; detail?: string };

const API_BASE = "";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const soraApi = {
  health: () => api<{ ok: boolean }>("/api/health"),
  agents: () => api<Agent[]>("/api/agents"),
  agent: (slug: string) => api<Agent>(`/api/agents/${slug}`),
  createAgent: (body: { name: string; description?: string }) =>
    api<Agent>("/api/agents", { method: "POST", body: JSON.stringify(body) }),
  runAgent: (slug: string, body: { prompt: string; skill?: string }) =>
    api<{
      reply: string;
      conversationId: string;
      toolCalls: Array<{ name: string; ok: boolean; output: string }>;
      skillId?: string;
    }>(`/api/agents/${slug}/run`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  conversations: (slug: string) =>
    api<Array<{ id: string; title: string }>>(
      `/api/agents/${slug}/conversations`,
    ),
  messages: (id: string) =>
    api<ConversationMessage[]>(`/api/conversations/${id}/messages`),
  skills: () => api<Skill[]>("/api/skills"),
  workflows: () => api<Workflow[]>("/api/workflows"),
  createWorkflow: (body: {
    name: string;
    agent: string;
    task: string;
    description?: string;
    skill?: string;
    cron?: string;
    webhook?: string;
    enabled?: boolean;
  }) =>
    api<Workflow>("/api/workflows", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  runWorkflow: (slug: string) =>
    api<unknown>(`/api/workflows/${slug}/run`, { method: "POST", body: "{}" }),
  tools: () =>
    api<Array<{ name: string; description: string }>>("/api/tools"),
  plugins: () => api<{ plugins: PluginStatus[] }>("/api/plugins"),
  connectPlugin: (id: string, app?: string) =>
    api<{
      ok: boolean;
      message: string;
      redirectUrl?: string;
      connectionId?: string;
    }>(`/api/plugins/${id}/connect`, {
      method: "POST",
      body: JSON.stringify({ app }),
    }),
  botdirectoryStatus: () =>
    api<{
      site: string;
      categories: string[];
      username: string | null;
      writeConfigured: boolean;
      catalog: {
        total: number;
        updatedAt: string;
        complete: boolean;
        nextCursor: string | null;
      };
    }>("/api/botdirectory").then((data) => ({
      // tolerate older field names from in-flight servers
      ...data,
      writeConfigured:
        data.writeConfigured ??
        (data as { writeReady?: boolean }).writeReady ??
        false,
    })),
  botdirectoryBots: (params?: {
    q?: string;
    category?: string;
    limit?: number;
    live?: boolean;
  }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.category) qs.set("category", params.category);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.live) qs.set("live", "1");
    const suffix = qs.toString() ? `?${qs}` : "";
    return api<{
      source: string;
      bots: Array<{
        slug: string;
        name: string;
        category: string;
        integrations: string[];
        prompt: string;
        detailUrl: string;
      }>;
    }>(`/api/botdirectory/bots${suffix}`);
  },
  botdirectorySync: (body?: {
    full?: boolean;
    reset?: boolean;
    maxPages?: number;
  }) =>
    api<{ ok: boolean; total?: number; added?: number; hasMore?: boolean }>(
      "/api/botdirectory/sync",
      { method: "POST", body: JSON.stringify(body ?? {}) },
    ),
  botdirectorySignup: (username: string) =>
    api<{ ok: boolean; username: string }>("/api/botdirectory/signup", {
      method: "POST",
      body: JSON.stringify({ username }),
    }),
  botdirectoryCredentials: (body: { username?: string; password: string }) =>
    api<{ ok: boolean; username: string | null }>(
      "/api/botdirectory/credentials",
      { method: "PUT", body: JSON.stringify(body) },
    ),
  botdirectoryImport: (body: { slug: string; name?: string }) =>
    api<{ ok: boolean; agent: Agent }>("/api/botdirectory/import", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  botdirectoryPublish: (body: {
    agentSlug?: string;
    name?: string;
    category: string;
    prompt?: string;
    integrations?: string[];
  }) =>
    api<{
      ok: boolean;
      slug: string;
      prUrl: string;
      prNumber: number;
    }>("/api/botdirectory/publish", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  botdirectoryNewsletter: (email: string) =>
    api<{ subscribed: boolean }>("/api/botdirectory/newsletter", {
      method: "POST",
      body: JSON.stringify({ email, source: "bot" }),
    }),
  pendingPermissions: () =>
    api<PendingPermission[]>("/api/permissions/pending"),
  respondPermission: (requestId: string, decision: "allow" | "deny") =>
    api<{ ok: boolean }>("/api/permissions/respond", {
      method: "POST",
      body: JSON.stringify({ requestId, decision }),
    }),
  providers: () =>
    api<{ providers: ProviderInfo[]; defaultModel: string }>(
      "/api/providers",
    ),
  setProvider: (
    id: string,
    body: { apiKey?: string; baseUrl?: string },
  ) =>
    api<{ ok: boolean; providers: ProviderInfo[] }>(`/api/providers/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  clearProvider: (id: string) =>
    api<{ ok: boolean }>(`/api/providers/${id}`, { method: "DELETE" }),
  testProvider: (model?: string) =>
    api<{ ok: boolean; model: string; reply?: string; error?: string }>(
      "/api/providers/test",
      {
        method: "POST",
        body: JSON.stringify({ model }),
      },
    ),
  getConfig: () =>
    api<{ defaultModel: string; home: string }>("/api/config"),
  setConfig: (body: { defaultModel: string }) =>
    api<{ defaultModel: string }>("/api/config", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  computer: (slug: string) =>
    api<ComputerInfo>(`/api/agents/${slug}/computer`),
  browserNavigate: (slug: string, url: string) =>
    api<{ ok: boolean; url: string; title: string; message: string }>(
      `/api/agents/${slug}/computer/browser/navigate`,
      { method: "POST", body: JSON.stringify({ url }) },
    ),
  browserScreenshot: (slug: string) =>
    api<{
      ok: boolean;
      message: string;
      base64?: string;
      width: number;
      height: number;
    }>(`/api/agents/${slug}/computer/browser/screenshot`, {
      method: "POST",
      body: "{}",
    }),
};

export function connectEvents(
  onEvent: (event: SoraEvent) => void,
): () => void {
  const es = new EventSource(`${API_BASE}/api/events`);
  es.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data) as SoraEvent);
    } catch {
      // ignore
    }
  };
  const handler = (e: MessageEvent) => {
    try {
      onEvent(JSON.parse(e.data) as SoraEvent);
    } catch {
      // ignore
    }
  };
  [
    "agent.started",
    "agent.completed",
    "agent.failed",
    "agent.tool.started",
    "agent.tool.completed",
    "agent.tool.failed",
    "agent.delegated",
    "permission.requested",
    "permission.pending",
    "workflow.started",
    "workflow.completed",
    "workflow.failed",
    "workflow.triggered",
  ].forEach((type) => es.addEventListener(type, handler as EventListener));

  return () => es.close();
}
