/** botdirectory.ai public API — https://botdirectory.ai/api/ */

export const BOTDIRECTORY_API =
  process.env.BOTDIRECTORY_API_URL?.replace(/\/$/, "") ??
  "https://api.botdirectory.ai";

export const BOTDIRECTORY_SITE = "https://botdirectory.ai";

export const BOTDIRECTORY_CATEGORIES = [
  "Marketing",
  "Ops",
  "Personal",
  "Productivity",
  "Sales",
  "Success",
] as const;

export type BotdirectoryCategory =
  (typeof BOTDIRECTORY_CATEGORIES)[number];

export type BotdirectoryBot = {
  slug: string;
  name: string;
  category: string;
  addedAt: string;
  integrations: string[];
  prompt: string;
  contributor: string | null;
  sourceUrl: string | null;
  detailUrl: string;
};

export type BotdirectoryListResponse = {
  version: number;
  bots: BotdirectoryBot[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  sync?: {
    limit?: number;
    returned: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  filters?: Record<string, unknown>;
  links?: { self?: string; next?: string | null; previous?: string | null };
};

export type BotdirectorySignupResult = {
  username: string;
  password: string;
};

export type BotdirectoryPublishResult = {
  slug: string;
  name: string;
  category: string;
  prNumber: number;
  prUrl: string;
  branch: string;
};

export type BotdirectorySearchParams = {
  q?: string;
  category?: string;
  integration?: string;
  page?: number;
  limit?: number;
  sort?: "newest" | "name";
  cursor?: string;
};

function authHeaders(password?: string | null): HeadersInit {
  if (!password) return { "content-type": "application/json", accept: "application/json" };
  return {
    "content-type": "application/json",
    accept: "application/json",
    authorization: `Bearer ${password}`,
    "x-api-key": password,
  };
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function botdirectoryFetch(
  path: string,
  init?: RequestInit & { password?: string | null },
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const { password, ...rest } = init ?? {};
  const res = await fetch(`${BOTDIRECTORY_API}${path}`, {
    ...rest,
    headers: {
      ...authHeaders(password),
      ...(rest.headers ?? {}),
    },
  });
  return { ok: res.ok, status: res.status, body: await parseJson(res) };
}

export async function listBots(
  params: BotdirectorySearchParams = {},
): Promise<BotdirectoryListResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.category) qs.set("category", params.category);
  if (params.integration) qs.set("integration", params.integration);
  if (params.cursor) {
    qs.set("cursor", params.cursor);
  } else {
    if (params.page) qs.set("page", String(params.page));
    if (params.sort) qs.set("sort", params.sort);
  }
  if (params.limit) qs.set("limit", String(Math.min(params.limit, 100)));
  const res = await botdirectoryFetch(`/api/bots?${qs}`);
  if (!res.ok) {
    throw new Error(`botdirectory ${res.status}: ${JSON.stringify(res.body)}`);
  }
  const body = res.body as BotdirectoryListResponse & {
    sync?: {
      hasMore?: boolean;
      has_more?: boolean;
      nextCursor?: string | null;
      next_cursor?: string | null;
      returned?: number;
      limit?: number;
    };
  };
  // Normalize cursor fields from the public API contract.
  if (body.sync) {
    body.sync = {
      limit: body.sync.limit,
      returned: body.sync.returned ?? body.bots?.length ?? 0,
      hasMore: Boolean(body.sync.hasMore ?? body.sync.has_more),
      nextCursor: body.sync.nextCursor ?? body.sync.next_cursor ?? null,
    };
  }
  return body as BotdirectoryListResponse;
}

/** Full one-shot mirror (prefer cursor sync for ongoing updates). */
export async function fetchFullFeed(): Promise<BotdirectoryBot[]> {
  const res = await fetch(`${BOTDIRECTORY_SITE}/api/bots.json`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`bots.json ${res.status}`);
  const body = (await res.json()) as
    | BotdirectoryBot[]
    | { bots: BotdirectoryBot[] };
  return Array.isArray(body) ? body : (body.bots ?? []);
}

export async function signup(
  username: string,
): Promise<BotdirectorySignupResult> {
  const res = await botdirectoryFetch("/api/signup", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    throw new Error(
      `signup ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }
  return res.body as BotdirectorySignupResult;
}

export async function whoAmI(
  password: string,
): Promise<{ username: string | null; owner?: boolean }> {
  const res = await botdirectoryFetch("/api/me", { password });
  if (!res.ok) {
    throw new Error(`/api/me ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body as { username: string | null; owner?: boolean };
}

export async function publishBot(
  password: string,
  input: {
    name: string;
    category: string;
    prompt: string;
    integrations: string[];
    contributorUrl?: string;
    scoutedBy?: string;
    integrationUrls?: Record<string, string>;
    url?: string;
    addedVia?: string;
  },
): Promise<BotdirectoryPublishResult> {
  const res = await botdirectoryFetch("/api/bots", {
    method: "POST",
    password,
    body: JSON.stringify({
      ...input,
      addedVia: input.addedVia ?? "https://github.com/sora-local/sora",
    }),
  });
  if (!res.ok) {
    throw new Error(`publish ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body as BotdirectoryPublishResult;
}

export async function sendFeedback(
  password: string,
  input: {
    slug: string;
    message: string;
    kind?: "works" | "broken" | "spam" | "other";
    rating?: number;
  },
): Promise<unknown> {
  const res = await botdirectoryFetch("/api/feedback", {
    method: "POST",
    password,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`feedback ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

/** Keyless newsletter enroll — never invent an email. */
export async function subscribeNewsletter(
  email: string,
  source = "bot",
): Promise<{ subscribed: boolean }> {
  const res = await botdirectoryFetch("/api/newsletter", {
    method: "POST",
    body: JSON.stringify({ email, source }),
  });
  if (!res.ok) {
    throw new Error(`newsletter ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body as { subscribed: boolean };
}
