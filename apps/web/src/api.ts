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

export type Conversation = {
  id: string;
  title: string;
  updatedAt?: string;
  createdAt?: string;
};

export type ConversationMessage = {
  id: string;
  role: string;
  content: string;
  toolName?: string;
  createdAt: string;
};

export type WorkflowRun = {
  id: string;
  workflowId: string;
  status: "running" | "completed" | "failed";
  triggerType: string;
  reply?: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
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
  allowCustomBaseUrl: boolean;
  docsUrl: string | null;
  hint: string | null;
  kind?: "llm" | "infra";
};

export type ModelOption = {
  id: string;
  name: string;
  description?: string;
};

export type BrowserInstallStatus = {
  playwrightInstalled: boolean;
  chromiumInstalled: boolean;
  message: string;
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
  provider?: string;
  capabilities?: {
    filesystem: boolean;
    terminal: boolean;
    browser: boolean;
    display: boolean;
    persistentProfile: boolean;
  };
  browser: {
    backend: string;
    open: boolean;
    url: string;
    title: string;
    profileDir?: string;
    headed: boolean;
  };
  files?: string[];
  sandbox?: { id?: string; provider?: string } | null;
};

export type SoraEvent = {
  id: string;
  type: string;
  timestamp: number;
  data?: Record<string, unknown>;
};

export type LiveEntry =
  | { kind: "user"; id: string; content: string }
  | {
      kind: "assistant";
      id: string;
      content: string;
      streamId?: string;
      streaming?: boolean;
    }
  | {
      kind: "tool";
      id: string;
      name: string;
      status: "started" | "completed" | "failed";
      detail?: string;
    }
  | { kind: "event"; id: string; type: string; detail?: string };

export type McpServer = {
  id: string;
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  enabled?: boolean;
  hasHeaders?: boolean;
};

function detectApiBase(): string {
  const fromEnv = (import.meta as { env?: Record<string, string> }).env
    ?.VITE_API_BASE;
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    const tauriHost =
      hostname === "tauri.localhost" ||
      hostname.endsWith(".tauri.localhost");
    const isTauri =
      protocol === "tauri:" ||
      protocol === "asset:" ||
      tauriHost ||
      // Tauri 2 injects internals in the webview
      Boolean(
        (window as unknown as { __TAURI_INTERNALS__?: unknown })
          .__TAURI_INTERNALS__,
      );
    if (isTauri) {
      return "http://127.0.0.1:7420";
    }
    if (
      protocol === "http:" &&
      (hostname === "localhost" || hostname === "127.0.0.1") &&
      port &&
      port !== "7420"
    ) {
      // Vite/Tauri-dev UI on :5173; relative URLs use the Vite proxy.
      return "";
    }
  }
  return "";
}

const API_BASE = detectApiBase();

/** Absolute API origin for webhook URLs and desktop clients. */
export function apiOrigin(): string {
  if (API_BASE) return API_BASE;
  if (typeof window !== "undefined" && window.location.origin.startsWith("http")) {
    // Dev proxy: prefer the real runtime port, not the Vite origin.
    return "http://127.0.0.1:7420";
  }
  return "http://127.0.0.1:7420";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    throw new Error(err.message || err.error || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const soraApi = {
  health: () => api<{ ok: boolean }>("/api/health"),
  agents: () => api<Agent[]>("/api/agents"),
  agent: (slug: string) => api<Agent>(`/api/agents/${slug}`),
  createAgent: (body?: {
    name?: string;
    description?: string;
    instructions?: string;
  }) =>
    api<Agent>("/api/agents", {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  vaultList: () =>
    api<{
      entries: Array<{
        id: string;
        label: string;
        kind: string;
        hint: string | null;
        updatedAt: string;
      }>;
    }>("/api/vault"),
  vaultSave: (body: {
    id?: string;
    label: string;
    value: string;
    kind?: "password" | "email" | "api_key" | "other";
  }) =>
    api<{
      ok: boolean;
      entries: Array<{
        id: string;
        label: string;
        kind: string;
        hint: string | null;
        updatedAt: string;
      }>;
    }>("/api/vault", { method: "POST", body: JSON.stringify(body) }),
  vaultDelete: (id: string) =>
    api<{
      ok: boolean;
      entries: Array<{
        id: string;
        label: string;
        kind: string;
        hint: string | null;
        updatedAt: string;
      }>;
    }>("/api/vault/" + encodeURIComponent(id), {
      method: "DELETE",
    }),
  updateAgent: (
    slug: string,
    body: {
      name?: string;
      description?: string;
      instructions?: string;
      model?: string;
    },
  ) =>
    api<Agent>(`/api/agents/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteAgent: (slug: string) =>
    api<{ ok: boolean; slug: string }>(
      `/api/agents/${encodeURIComponent(slug)}`,
      { method: "DELETE" },
    ),
  runAgent: (
    slug: string,
    body: { prompt: string; skill?: string; conversationId?: string },
  ) =>
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
    api<Conversation[]>(`/api/agents/${slug}/conversations`),
  messages: (id: string) =>
    api<ConversationMessage[]>(`/api/conversations/${id}/messages`),
  skills: () => api<Skill[]>("/api/skills"),
  workflows: () => api<Workflow[]>("/api/workflows"),
  workflowRuns: (slug: string, limit = 20) =>
    api<WorkflowRun[]>(
      `/api/workflows/${encodeURIComponent(slug)}/runs?limit=${limit}`,
    ),
  computerDisplay: (slug: string) =>
    api<{
      ok: boolean;
      watching: boolean;
      frame: {
        base64?: string;
        streamUrl?: string;
        width?: number;
        height?: number;
        updatedAt?: string;
      } | null;
    }>(`/api/agents/${encodeURIComponent(slug)}/computer/display`),
  computerTakeover: (slug: string) =>
    api<{
      ok: boolean;
      streamUrl?: string;
      message: string;
      error?: string;
    }>(`/api/agents/${encodeURIComponent(slug)}/computer/takeover`, {
      method: "POST",
    }),
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
  recordWorkflow: (body: {
    conversationId: string;
    name: string;
    description?: string;
    agent?: string;
    cron?: string;
    webhook?: string;
  }) =>
    api<{ ok: boolean; workflow: Workflow; steps: number }>(
      "/api/workflows/record",
      { method: "POST", body: JSON.stringify(body) },
    ),
  runWorkflow: (slug: string) =>
    api<unknown>(`/api/workflows/${slug}/run`, { method: "POST", body: "{}" }),
  setWorkflowEnabled: (slug: string, enabled: boolean) =>
    api<Workflow>(`/api/workflows/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),
  deleteWorkflow: (slug: string) =>
    api<{ ok: boolean; slug: string }>(
      `/api/workflows/${encodeURIComponent(slug)}`,
      { method: "DELETE" },
    ),
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
  botdirectoryBot: (slug: string) =>
    api<{
      bot: {
        slug: string;
        name: string;
        category: string;
        integrations: string[];
        prompt: string;
        detailUrl?: string;
      };
    }>(`/api/botdirectory/bots/${encodeURIComponent(slug)}`),
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
    api<{
      ok: boolean;
      agent: Agent;
      setupPrompt: string;
      bot: {
        slug: string;
        name: string;
        category: string;
        integrations: string[];
        detailUrl: string;
      };
    }>("/api/botdirectory/import", {
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
  respondPermission: (
    requestId: string,
    decision: "allow" | "deny",
    options?: { rememberSession?: boolean },
  ) =>
    api<{ ok: boolean }>("/api/permissions/respond", {
      method: "POST",
      body: JSON.stringify({
        requestId,
        decision,
        rememberSession: options?.rememberSession ?? false,
      }),
    }),
  providers: () =>
    api<{
      providers: ProviderInfo[];
      models: Record<string, ModelOption[]>;
      defaultModel: string;
    }>("/api/providers"),
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
    api<{
      defaultModel: string;
      displayName?: string | null;
      browser: "on" | "off";
      computer?: {
        provider: string;
        failClosed?: boolean;
        idleMs?: number;
        commandTimeoutMs?: number;
        preferDisplay?: boolean;
      };
      sandbox: {
        enabled: boolean;
        provider: string;
        failClosed?: boolean;
        idleMs?: number;
        commandTimeoutMs?: number;
      };
      home: string;
    }>("/api/config"),
  setConfig: (body: {
    defaultModel?: string;
    displayName?: string;
    browser?: "on" | "off";
    computer?: {
      provider?: string;
      failClosed?: boolean;
      idleMs?: number;
      commandTimeoutMs?: number;
      preferDisplay?: boolean;
    };
    sandbox?: {
      enabled?: boolean;
      provider?: string;
      failClosed?: boolean;
      idleMs?: number;
      commandTimeoutMs?: number;
    };
  }) =>
    api<{
      defaultModel: string;
      displayName?: string | null;
      browser: "on" | "off";
      computer?: {
        provider: string;
        failClosed?: boolean;
        idleMs?: number;
        commandTimeoutMs?: number;
        preferDisplay?: boolean;
      };
      sandbox: {
        enabled: boolean;
        provider: string;
        failClosed?: boolean;
        idleMs?: number;
        commandTimeoutMs?: number;
      };
    }>("/api/config", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  mcpServers: () => api<{ servers: McpServer[] }>("/api/mcp"),
  addMcpServer: (body: {
    id: string;
    name: string;
    transport: "stdio" | "http";
    command?: string;
    args?: string[];
    url?: string;
    enabled?: boolean;
  }) =>
    api<{ ok: boolean; servers: McpServer[] }>("/api/mcp/servers", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteMcpServer: (id: string) =>
    api<{ ok: boolean; servers: McpServer[] }>(
      `/api/mcp/servers/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
  reloadMcp: () =>
    api<{ ok: boolean; tools: string[] }>("/api/mcp/reload", {
      method: "POST",
      body: "{}",
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
  browserStatus: () => api<BrowserInstallStatus>("/api/browser/status"),
  browserInstall: () =>
    api<{ ok: boolean; output: string; error?: string }>(
      "/api/browser/install",
      { method: "POST", body: "{}" },
    ),
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
    "agent.text.started",
    "agent.text.delta",
    "agent.text.done",
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
