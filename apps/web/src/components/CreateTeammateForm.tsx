import { useState } from "react";
import { soraApi, type Agent } from "../api";
import { isReservedTeammateName, pickTeammateName } from "../teammateNames";

type BdBot = {
  slug: string;
  name: string;
  category: string;
  integrations: string[];
  prompt?: string;
};

/**
 * Bot Directory / Rakazo contract: listings are setup prompts you paste into
 * chat. UI is name + prompt; directory search only fills the prompt.
 */
const SETUP_SHELL = (name: string, integrations: string[]) =>
  [
    `You are ${name}, being set up from a setup prompt (Bot Directory style).`,
    "The user's first message is that setup prompt — treat it as your job description.",
    "Work only in this chat. Never use delegate_task during setup — Gmail, Calendar, Slack, X, and other apps are not teammates.",
    "First responses: ask the questions the prompt asks (values, boundaries, sacred relationships, etc.).",
    "To connect apps, tell the user to tap + in the message bar (or Connected apps) and link via Composio — browser login, no passwords in chat.",
    integrations.length
      ? `This prompt expects: ${integrations.join(", ")}.`
      : "",
    "Do not read email, calendar, or messages until those apps are linked, or the user says to proceed with a supervised dry run on what you already have.",
    "First run is supervised: analyze and recommend only — no calendar changes, no sending messages until they approve.",
    "Never ask for passwords or API keys in chat.",
  ]
    .filter(Boolean)
    .join(" ");

export default function CreateTeammateForm({
  existingNames = [],
  defaultModel,
  onReady,
  onError,
  compact = false,
}: {
  existingNames?: string[];
  defaultModel?: string;
  onReady: (
    agent: Agent,
    meta: { setupPrompt: string; integrations: string[] },
  ) => void | Promise<void>;
  onError: (message: string) => void;
  compact?: boolean;
}) {
  const [name, setName] = useState(() => pickTeammateName(existingNames));
  const [paste, setPaste] = useState("");
  const [integrations, setIntegrations] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [bots, setBots] = useState<BdBot[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function search() {
    setBusy("search");
    setCatalogOpen(true);
    try {
      const status = await soraApi.botdirectoryStatus();
      if ((status.catalog.total ?? 0) === 0) {
        await soraApi.botdirectorySync({ full: true });
      }
      const data = await soraApi.botdirectoryBots({
        q: query.trim() || undefined,
        limit: 20,
      });
      setBots((data.bots ?? []) as BdBot[]);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  /** Copy listing into the prompt field (botdirectory.ai “copy prompt”). */
  async function copyListing(bot: BdBot) {
    setBusy(`copy:${bot.slug}`);
    try {
      const { bot: full } = await soraApi.botdirectoryBot(bot.slug);
      const prompt = full.prompt?.trim();
      if (!prompt) {
        onError("That listing has no prompt body.");
        return;
      }
      setName(full.name || bot.name);
      setPaste(prompt);
      setIntegrations(full.integrations ?? bot.integrations ?? []);
      setCatalogOpen(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    const prompt = paste.trim();
    if (!prompt) {
      onError("Paste a setup prompt first (or copy one from Bot Directory below).");
      return;
    }
    const teammateName = name.trim() || pickTeammateName(existingNames);
    if (isReservedTeammateName(teammateName)) {
      onError("That name is reserved for the app. Pick a teammate name.");
      return;
    }
    setBusy("start");
    try {
      const agent = await soraApi.createAgent({
        name: teammateName,
        instructions: SETUP_SHELL(teammateName, integrations),
      });
      if (defaultModel) {
        await soraApi.updateAgent(agent.slug, { model: defaultModel });
      }
      await onReady(agent, {
        setupPrompt: prompt,
        integrations,
      });
      setPaste("");
      setIntegrations([]);
      setName(pickTeammateName([...existingNames, agent.name]));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-ink">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this teammate"
          className="h-9 rounded-control border border-line bg-field px-3 text-[13px] text-ink outline-none focus:border-line-strong"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-ink">Prompt</span>
        <textarea
          value={paste}
          onChange={(e) => {
            setPaste(e.target.value);
            setIntegrations([]);
          }}
          rows={compact ? 5 : 8}
          placeholder="Paste the full setup prompt here…"
          className="rounded-control border border-line bg-field px-3 py-2 text-[13px] leading-relaxed text-ink outline-none focus:border-line-strong"
        />
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          Keep the whole prompt together (workflow, tools, guardrails). After
          you start, answer its questions and connect apps when asked — no
          passwords in chat.
        </p>
      </label>

      <button
        type="button"
        disabled={busy === "start" || !paste.trim()}
        onClick={() => void start()}
        className="self-start rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface disabled:opacity-50"
      >
        {busy === "start" ? "Starting…" : "Start"}
      </button>

      <div className="border-t border-line pt-3">
        <p className="text-[12.5px] font-medium text-ink">
          Or search{" "}
          <a
            href="https://botdirectory.ai"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-ink-2"
          >
            botdirectory.ai
          </a>
        </p>
        <p className="mt-0.5 text-[11.5px] text-ink-3">
          Copy a listing into the prompt above, then Start — same as pasting
          into any agent.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            className="h-9 min-w-0 flex-1 rounded-control border border-line bg-field px-3 text-[13px] text-ink outline-none focus:border-line-strong"
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
          />
          <button
            type="button"
            disabled={busy === "search"}
            onClick={() => void search()}
            className="rounded-control bg-field px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-hover disabled:opacity-50"
          >
            {busy === "search" ? "…" : "Search"}
          </button>
        </div>

        {catalogOpen && (
          <ul
            className={`mt-2 overflow-y-auto rounded-[12px] border border-line ${
              compact ? "max-h-40" : "max-h-52"
            }`}
          >
            {bots.length === 0 && (
              <li className="px-3 py-3 text-[12.5px] text-ink-3">
                {busy === "search" ? "Loading…" : "No matches."}
              </li>
            )}
            {bots.map((bot) => (
              <li
                key={bot.slug}
                className="flex items-start justify-between gap-2 border-b border-line px-3 py-2.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">
                    {bot.name}
                  </p>
                  <p className="truncate text-[11.5px] text-ink-3">
                    {bot.category}
                    {bot.integrations?.length
                      ? ` · ${bot.integrations.slice(0, 3).join(", ")}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy === `copy:${bot.slug}`}
                  onClick={() => void copyListing(bot)}
                  className="shrink-0 rounded-control bg-field px-2.5 py-1 text-[12px] font-medium text-ink-2 hover:bg-hover disabled:opacity-50"
                >
                  {busy === `copy:${bot.slug}` ? "…" : "Copy prompt"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
