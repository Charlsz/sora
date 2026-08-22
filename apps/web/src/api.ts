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
  runWorkflow: (slug: string) =>
    api<unknown>(`/api/workflows/${slug}/run`, { method: "POST", body: "{}" }),
  tools: () =>
    api<Array<{ name: string; description: string }>>("/api/tools"),
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
