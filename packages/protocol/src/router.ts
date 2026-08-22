export type RoutableAgent = {
  id: string;
  slug: string;
  name: string;
  description: string;
  capabilities: string[];
};

export type RouteQuery = {
  task: string;
  requiredCapabilities?: string[];
  /** Exclude these agent ids (e.g. the requester). */
  excludeAgentIds?: string[];
  prefer?: string;
};

export type RouteScore = {
  agent: RoutableAgent;
  score: number;
  reasons: string[];
};

/**
 * Generic capability/description router.
 * Does not hardcode task→agent mappings.
 */
export class AgentRouter {
  route(agents: RoutableAgent[], query: RouteQuery): RouteScore | null {
    const ranked = this.rank(agents, query);
    return ranked[0] ?? null;
  }

  rank(agents: RoutableAgent[], query: RouteQuery): RouteScore[] {
    const exclude = new Set(query.excludeAgentIds ?? []);
    const taskTokens = tokenize(query.task);
    const required = (query.requiredCapabilities ?? []).map((c) =>
      c.toLowerCase(),
    );
    const prefer = query.prefer?.trim().toLowerCase();

    const scores: RouteScore[] = [];

    for (const agent of agents) {
      if (exclude.has(agent.id)) continue;

      let score = 0;
      const reasons: string[] = [];

      if (prefer) {
        if (
          agent.slug.toLowerCase() === prefer ||
          agent.name.toLowerCase() === prefer
        ) {
          score += 100;
          reasons.push(`preferred:${prefer}`);
        }
      }

      const caps = agent.capabilities.map((c) => c.toLowerCase());
      const haystack = tokenize(
        `${agent.name} ${agent.description} ${caps.join(" ")}`,
      );

      for (const req of required) {
        if (caps.includes(req) || haystack.has(req)) {
          score += 25;
          reasons.push(`capability:${req}`);
        } else {
          score -= 15;
          reasons.push(`missing:${req}`);
        }
      }

      let overlap = 0;
      for (const token of taskTokens) {
        if (haystack.has(token) || caps.includes(token)) {
          overlap += 1;
        }
      }
      if (overlap) {
        score += overlap * 8;
        reasons.push(`overlap:${overlap}`);
      }

      // slight bias toward specialized agents with any capabilities listed
      if (caps.length) {
        score += 2;
        reasons.push("has-capabilities");
      }

      if (score > 0) {
        scores.push({ agent, score, reasons });
      }
    }

    return scores.sort((a, b) => b.score - a.score);
  }
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/g)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "for",
  "and",
  "or",
  "of",
  "in",
  "on",
  "with",
  "ask",
  "please",
  "need",
  "someone",
  "who",
  "that",
  "this",
  "create",
  "make",
  "build",
  "write",
  "run",
]);
