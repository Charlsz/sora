import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  fetchFullFeed,
  listBots,
  type BotdirectoryBot,
  type BotdirectorySearchParams,
} from "./botdirectory-client.ts";

export type BotdirectoryCatalog = {
  version: 1;
  updatedAt: string;
  /** Cursor for append-safe sync; null when fully caught up once. */
  nextCursor: string | null;
  /** True after a sync pass reported hasMore=false. */
  complete: boolean;
  bots: Record<string, BotdirectoryBot>;
};

export function emptyCatalog(): BotdirectoryCatalog {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    nextCursor: "start",
    complete: false,
    bots: {},
  };
}

export function loadCatalog(path: string): BotdirectoryCatalog {
  if (!existsSync(path)) return emptyCatalog();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as BotdirectoryCatalog;
    return {
      version: 1,
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
      nextCursor: raw.nextCursor ?? "start",
      complete: Boolean(raw.complete),
      bots: raw.bots ?? {},
    };
  } catch {
    return emptyCatalog();
  }
}

export function saveCatalog(path: string, catalog: BotdirectoryCatalog): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      { ...catalog, updatedAt: new Date().toISOString() },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
}

export function searchLocal(
  catalog: BotdirectoryCatalog,
  params: {
    q?: string;
    category?: string;
    integration?: string;
    limit?: number;
  },
): BotdirectoryBot[] {
  const q = params.q?.trim().toLowerCase();
  const category = params.category?.trim().toLowerCase();
  const integration = params.integration?.trim().toLowerCase();
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);

  const matches = Object.values(catalog.bots).filter((bot) => {
    if (category && bot.category.toLowerCase() !== category) return false;
    if (
      integration &&
      !bot.integrations.some((i) => i.toLowerCase() === integration)
    ) {
      return false;
    }
    if (!q) return true;
    const hay = [
      bot.name,
      bot.slug,
      bot.prompt,
      bot.contributor ?? "",
      bot.category,
      ...bot.integrations,
    ]
      .join("\n")
      .toLowerCase();
    return hay.includes(q);
  });

  matches.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  return matches.slice(0, limit);
}

/**
 * Append-safe cursor sync. Returns how many bots were written this pass.
 */
export async function syncCatalog(
  path: string,
  options: {
    maxPages?: number;
    limit?: number;
    filters?: Pick<BotdirectorySearchParams, "q" | "category" | "integration">;
    /** Restart from the beginning. */
    reset?: boolean;
  } = {},
): Promise<{
  added: number;
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
}> {
  const catalog = options.reset ? emptyCatalog() : loadCatalog(path);
  let cursor = catalog.nextCursor ?? "start";
  if (catalog.complete && !options.reset) {
    // Resume from last cursor so new bots append; if complete, start a new
    // append pass from the stored nextCursor or "start" if missing.
    cursor = catalog.nextCursor && catalog.nextCursor !== "start"
      ? catalog.nextCursor
      : "start";
  }

  const maxPages = options.maxPages ?? 5;
  const limit = Math.min(options.limit ?? 100, 100);
  let added = 0;
  let hasMore = true;
  let nextCursor: string | null = cursor;

  for (let page = 0; page < maxPages; page++) {
    const res = await listBots({
      ...options.filters,
      cursor,
      limit,
    });
    for (const bot of res.bots) {
      if (!catalog.bots[bot.slug]) added += 1;
      catalog.bots[bot.slug] = bot;
    }
    hasMore = Boolean(res.sync?.hasMore);
    nextCursor = res.sync?.nextCursor ?? null;
    catalog.nextCursor = nextCursor;
    catalog.complete = !hasMore;
    if (!hasMore || !nextCursor) break;
    cursor = nextCursor;
  }

  saveCatalog(path, catalog);
  return {
    added,
    total: Object.keys(catalog.bots).length,
    hasMore,
    nextCursor,
  };
}

/** One-shot full replace from bots.json (good for first install). */
export async function mirrorFullFeed(path: string): Promise<number> {
  const bots = await fetchFullFeed();
  const catalog = emptyCatalog();
  for (const bot of bots) catalog.bots[bot.slug] = bot;
  catalog.nextCursor = null;
  catalog.complete = true;
  saveCatalog(path, catalog);
  return bots.length;
}
