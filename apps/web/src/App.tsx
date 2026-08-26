import { useEffect, useMemo, useRef, useState } from "react";
import {
  connectEvents,
  soraApi,
  type Agent,
  type Conversation,
  type LiveEntry,
  type PendingPermission,
  type Skill,
  type Workflow,
} from "./api";
import ApprovalCard from "./components/ApprovalCard";
import AgentsPanel from "./components/AgentsPanel";
import ComputerPanel from "./components/ComputerPanel";
import Onboarding from "./components/Onboarding";
import PluginsPanel from "./components/PluginsPanel";
import PromptBar from "./components/PromptBar";
import ProviderSettings from "./components/ProviderSettings";
import RoutinesPanel from "./components/RoutinesPanel";
import SidebarNav from "./components/SidebarNav";
import WorkBoard, { type WorkerStatus } from "./components/WorkBoard";
import StreamingText from "./components/StreamingText";
import type { ToolRow } from "./components/ToolChips";

function parseSkillFromPrompt(prompt: string): {
  prompt: string;
  skill?: string;
} {
  const match = /^\/([\w-]+)\s*(.*)$/s.exec(prompt.trim());
  if (!match) return { prompt };
  return { skill: match[1], prompt: match[2]!.trim() || match[1]! };
}

export function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [live, setLive] = useState<LiveEntry[]>([]);
  const [pending, setPending] = useState<PendingPermission[]>([]);
  const [nav, setNav] = useState("chats");
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>("");
  const [aiConnected, setAiConnected] = useState(false);
  const [computerReady, setComputerReady] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [saveRoutineBusy, setSaveRoutineBusy] = useState(false);
  const [computerOpen, setComputerOpen] = useState(true);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  const active = useMemo(
    () => agents.find((a) => a.slug === selected) ?? null,
    [agents, selected],
  );

  async function refresh() {
    const [a, s, w, p, providers] = await Promise.all([
      soraApi.agents(),
      soraApi.skills(),
      soraApi.workflows(),
      soraApi.pendingPermissions().catch(() => [] as PendingPermission[]),
      soraApi.providers().catch(() => null),
    ]);
    setAgents(a);
    setSkills(s);
    setWorkflows(w);
    setPending(p);
    if (providers) {
      setDefaultModel(providers.defaultModel);
      setAiConnected(
        providers.providers.some(
          (p) =>
            p.configured &&
            p.id !== "mock" &&
            p.kind !== "infra" &&
            (p.needsKey || p.id === "ollama"),
        ),
      );
      setComputerReady(
        Boolean(providers.providers.find((p) => p.id === "e2b")?.configured),
      );
    }
    setSelected((prev) => prev ?? a[0]?.slug ?? null);
  }

  useEffect(() => {
    soraApi
      .health()
      .then(() => {
        setApiOk(true);
        return refresh();
      })
      .catch(() => setApiOk(false));

    return connectEvents((event) => {
      if (event.type === "permission.pending") {
        const data = event.data ?? {};
        if (typeof data.requestId === "string") {
          setPending((prev) => {
            if (prev.some((p) => p.requestId === data.requestId)) return prev;
            return [
              ...prev,
              {
                requestId: data.requestId as string,
                agentId: String(data.agentId ?? ""),
                agentSlug: String(data.agentSlug ?? ""),
                action: String(data.action ?? ""),
                resource: String(data.resource ?? ""),
                detail: data.detail as Record<string, unknown> | undefined,
                createdAt: String(data.createdAt ?? new Date().toISOString()),
              },
            ];
          });
        }
      } else if (event.type === "permission.requested") {
        void soraApi.pendingPermissions().then(setPending).catch(() => {});
      } else if (event.type === "agent.text.started") {
        const streamId = String(event.data?.streamId ?? event.id);
        setLive((prev) => [
          ...prev,
          {
            kind: "assistant",
            id: streamId,
            streamId,
            content: "",
            streaming: true,
          },
        ]);
      } else if (event.type === "agent.text.delta") {
        const streamId = String(event.data?.streamId ?? "");
        const delta = String(event.data?.delta ?? "");
        if (!delta) return;
        setLive((prev) =>
          prev.map((e) =>
            e.kind === "assistant" && e.streamId === streamId
              ? { ...e, content: e.content + delta }
              : e,
          ),
        );
      } else if (event.type === "agent.text.done") {
        const streamId = String(event.data?.streamId ?? "");
        setLive((prev) =>
          prev.map((e) =>
            e.kind === "assistant" && e.streamId === streamId
              ? { ...e, streaming: false }
              : e,
          ),
        );
      } else if (event.type === "agent.completed") {
        const cid = event.data?.conversationId;
        if (typeof cid === "string") setConversationId(cid);
      } else if (event.type === "agent.tool.started") {
        setLive((prev) => [
          ...prev,
          {
            kind: "tool",
            id: event.id,
            name: String(event.data?.tool ?? "tool"),
            status: "started",
          },
        ]);
      } else if (event.type === "agent.tool.completed") {
        setLive((prev) =>
          prev.map((e) =>
            e.kind === "tool" &&
            e.name === event.data?.tool &&
            e.status === "started"
              ? {
                  ...e,
                  status: "completed",
                  detail: String(event.data?.output ?? ""),
                }
              : e,
          ),
        );
      } else if (event.type === "agent.tool.failed") {
        setLive((prev) =>
          prev.map((e) =>
            e.kind === "tool" &&
            e.name === event.data?.tool &&
            e.status === "started"
              ? {
                  ...e,
                  status: "failed",
                  detail: String(event.data?.error ?? ""),
                }
              : e,
          ),
        );
      }
    });
  }, []);

  useEffect(() => {
    if (!headerMenuOpen) return;
    const close = (e: PointerEvent) => {
      if (!headerMenuRef.current?.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [headerMenuOpen]);

  async function loadConversation(id: string) {
    setConversationId(id);
    const msgs = await soraApi.messages(id);
    setLive(
      msgs
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) =>
          m.role === "user"
            ? {
                kind: "user" as const,
                id: m.id,
                content: m.content,
              }
            : {
                kind: "assistant" as const,
                id: m.id,
                content: m.content,
              },
        ),
    );
  }

  useEffect(() => {
    if (!selected) {
      setConversationId(null);
      setConversations([]);
      setLive([]);
      return;
    }
    void (async () => {
      try {
        const convs = await soraApi.conversations(selected);
        setConversations(convs);
        if (convs.length === 0) {
          setConversationId(null);
          setLive([]);
          return;
        }
        const latest = convs[0]!;
        setChatTitle(latest.title || null);
        await loadConversation(latest.id);
      } catch {
        setConversationId(null);
        setConversations([]);
        setLive([]);
      }
    })();
  }, [selected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [live.length, busy, pending.length]);

  const showOnboarding =
    apiOk &&
    (!aiConnected || !computerReady || agents.length === 0) &&
    !onboardingDone;

  const toolRows: ToolRow[] = live
    .filter((e): e is Extract<LiveEntry, { kind: "tool" }> => e.kind === "tool")
    .map((e) => ({
      id: e.id,
      label: e.name,
      chip: e.status === "started" ? "running…" : e.status,
      mono: true,
      status: e.status,
      detail: e.detail ? e.detail.split("\n").slice(0, 6) : undefined,
    }));

  const workerStatus: WorkerStatus = pending.length
    ? "needs_you"
    : busy
      ? "working"
      : toolRows.some((r) => r.status === "failed") && live.length > 0
        ? "failed"
        : live.length > 0 && !busy
          ? "done"
          : "idle";

  const latestUser = [...live]
    .reverse()
    .find((e): e is Extract<LiveEntry, { kind: "user" }> => e.kind === "user");
  const latestUserTask = latestUser?.content ?? chatTitle;

  /** Teammates, with the selected one’s conversations nested underneath. */
  const sidebarList = useMemo(() => {
    const rows: Array<{
      id: string;
      label: string;
      nested?: boolean;
      status?: string;
      teammate?: boolean;
    }> = [];
    for (const a of agents) {
      const isActive = a.slug === selected;
      const status =
        isActive && workerStatus === "working"
          ? "Working"
          : isActive && workerStatus === "needs_you"
            ? "Needs you"
            : a.status === "running"
              ? "Working"
              : "Idle";
      rows.push({
        id: `agent:${a.slug}`,
        label: a.name,
        status,
        teammate: true,
      });
      if (isActive) {
        for (const c of conversations.slice(0, 12)) {
          rows.push({
            id: `conv:${c.id}`,
            label: c.title?.trim() || "Task",
            nested: true,
          });
        }
      }
    }
    return rows;
  }, [agents, selected, conversations, workerStatus]);

  const activeListId = conversationId
    ? `conv:${conversationId}`
    : selected
      ? `agent:${selected}`
      : null;

  async function saveChatAsRoutine() {
    if (!conversationId || !active || saveRoutineBusy) return;
    const defaultName = (chatTitle || "recorded-routine")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 48);
    const name = window.prompt("Routine name", defaultName || "recorded-routine");
    if (!name?.trim()) return;
    setSaveRoutineBusy(true);
    setError(null);
    setHeaderMenuOpen(false);
    try {
      const result = await soraApi.recordWorkflow({
        conversationId,
        name: name.trim(),
        agent: active.slug,
      });
      await refresh();
      setNav("routines");
      window.alert(
        `Routine "${result.workflow.name}" saved with ${result.steps} tool step(s).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaveRoutineBusy(false);
    }
  }

  async function send(text: string) {
    if (!active || busy) return;
    const { prompt, skill } = parseSkillFromPrompt(text);
    const mention = /@([\w-]+)/.exec(prompt);
    let slug = active.slug;
    let clean = prompt;
    if (mention) {
      const named = agents.find(
        (a) =>
          a.slug === mention[1] ||
          a.name.toLowerCase() === mention[1]!.toLowerCase(),
      );
      if (named) {
        slug = named.slug;
        setSelected(slug);
        clean = prompt.replace(mention[0], "").trim() || prompt;
      }
    }

    setError(null);
    setBusy(true);
    setChatTitle(clean.slice(0, 48) || "New chat");
    setLive((prev) => [
      ...prev,
      { kind: "user", id: crypto.randomUUID(), content: clean },
    ]);
    setNav("chats");

    try {
      const result = await soraApi.runAgent(slug, {
        prompt: clean,
        skill,
        conversationId: conversationId ?? undefined,
      });
      setConversationId(result.conversationId);
      try {
        const convs = await soraApi.conversations(slug);
        setConversations(convs);
      } catch {
        /* ignore */
      }
      setLive((prev) => {
        const hasStreamed = prev.some(
          (e) => e.kind === "assistant" && e.streamId,
        );
        if (hasStreamed) {
          return prev.map((e) =>
            e.kind === "assistant" && e.streamId
              ? {
                  ...e,
                  content: result.reply || e.content,
                  streaming: false,
                }
              : e,
          );
        }
        return [
          ...prev,
          {
            kind: "assistant",
            id: crypto.randomUUID(),
            content: result.reply,
          },
        ];
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function respondPermission(
    requestId: string,
    decision: "allow" | "deny",
    options?: { rememberSession?: boolean },
  ) {
    await soraApi.respondPermission(requestId, decision, options);
    setPending((prev) => prev.filter((p) => p.requestId !== requestId));
  }

  if (apiOk === false) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="font-display text-3xl text-ink">Sora</p>
          <p className="mt-2 text-[14px] text-ink-2">
            Sora isn’t running yet. Open the desktop app again, or start it from
            your install folder.
          </p>
        </div>
      </div>
    );
  }

  const showChatChrome = nav === "chats" && !showOnboarding;

  return (
    <div className="flex h-full min-h-0">
      <SidebarNav
        fill
        brand="Sora"
        monogram="S"
        activeId={nav === "chats" ? activeListId : null}
        activeNav={nav}
        onNavigate={setNav}
        listLabel="Teammates"
        online={apiOk}
        recents={sidebarList}
        moreItems={[
          { key: "routines", label: "Schedules" },
          { key: "agents", label: "Manage teammates" },
          { key: "plugins", label: "Connected apps" },
          { key: "settings", label: "Connections" },
        ]}
        footerLabel="Settings"
        onFooterClick={() => setNav("settings")}
        onNewChat={() => {
          setNav("agents");
        }}
        onPick={(id, label) => {
          if (id.startsWith("agent:")) {
            setSelected(id.slice(6));
            setNav("chats");
            setChatTitle(label);
          } else if (id.startsWith("conv:")) {
            const cid = id.slice(5);
            setNav("chats");
            const conv = conversations.find((c) => c.id === cid);
            setChatTitle(conv?.title || label);
            void loadConversation(cid).catch((err) =>
              setError(err instanceof Error ? err.message : String(err)),
            );
          }
        }}
      />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold text-ink">
              {showOnboarding
                ? "Welcome"
                : nav === "routines"
                  ? "Schedules"
                  : nav === "agents"
                    ? "New teammate"
                    : nav === "plugins"
                      ? "Connected apps"
                      : nav === "settings"
                        ? "Connections"
                        : (active?.name ?? "Pick a teammate")}
            </h1>
            {showChatChrome && active && (
              <p className="flex items-center gap-1.5 truncate text-[12px] text-ink-3">
                <span
                  className={`size-1.5 shrink-0 rounded-full ${
                    workerStatus === "working"
                      ? "bg-accent animate-pulse"
                      : workerStatus === "needs_you"
                        ? "bg-orange"
                        : workerStatus === "done"
                          ? "bg-green"
                          : "bg-ink-3"
                  }`}
                />
                {workerStatus === "working"
                  ? "Working"
                  : workerStatus === "needs_you"
                    ? "Needs your approval"
                    : workerStatus === "done"
                      ? "Done"
                      : workerStatus === "failed"
                        ? "Failed"
                        : "Idle · give them a task"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {showChatChrome && active && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setLive([]);
                    setChatTitle(null);
                    setConversationId(null);
                    setError(null);
                  }}
                  className="rounded-control bg-field px-2.5 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover"
                >
                  New task
                </button>
                <button
                  type="button"
                  onClick={() => setComputerOpen((o) => !o)}
                  className={`rounded-control px-2.5 py-1.5 text-[12px] font-medium ${
                    computerOpen
                      ? "bg-green-tint text-green"
                      : "bg-field text-ink-2 hover:bg-hover"
                  }`}
                >
                  Computer
                </button>
                <div className="relative" ref={headerMenuRef}>
                  <button
                    type="button"
                    aria-label="More actions"
                    onClick={() => setHeaderMenuOpen((o) => !o)}
                    className="flex size-8 items-center justify-center rounded-control bg-field text-ink-2 hover:bg-hover"
                  >
                    ···
                  </button>
                  {headerMenuOpen && (
                    <div className="absolute top-full right-0 z-40 mt-1 w-48 rounded-[12px] bg-surface p-1 shadow-overlay">
                      <button
                        type="button"
                        disabled={
                          !conversationId ||
                          saveRoutineBusy ||
                          !toolRows.some((t) => t.status === "completed")
                        }
                        onClick={() => void saveChatAsRoutine()}
                        className="flex h-9 w-full items-center rounded-[8px] px-2.5 text-left text-[13px] text-ink-2 hover:bg-hover disabled:opacity-40"
                      >
                        Save as schedule
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          setNav("agents");
                        }}
                        className="flex h-9 w-full items-center rounded-[8px] px-2.5 text-left text-[13px] text-ink-2 hover:bg-hover"
                      >
                        Manage teammate
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </header>

        <div className="scroll-pane min-h-0 flex-1 px-5 py-4">
          {error && nav !== "chats" && (
            <p className="mb-4 rounded-control bg-red-tint px-3 py-2 text-[13px] text-red">
              {error}
            </p>
          )}
          {showOnboarding ? (
            <Onboarding
              onDone={() => {
                setOnboardingDone(true);
                void refresh().then(() => setNav("chats"));
              }}
            />
          ) : nav === "settings" ? (
            <ProviderSettings onChanged={() => void refresh()} />
          ) : nav === "plugins" ? (
            <PluginsPanel onChanged={() => void refresh()} />
          ) : nav === "routines" ? (
            <RoutinesPanel
              agents={agents}
              workflows={workflows}
              onChanged={() => void refresh()}
              onError={(message) => setError(message)}
            />
          ) : nav === "agents" ? (
            <AgentsPanel
              agents={agents}
              defaultModel={defaultModel}
              onSelect={(slug) => {
                setSelected(slug);
                setNav("chats");
              }}
              onChanged={() => void refresh()}
              onError={(message) => setError(message)}
            />
          ) : (
            <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
              {live.length === 0 && !busy && (
                <div className="py-16">
                  <p className="text-[18px] font-semibold text-ink">
                    {active
                      ? `Give ${active.name} something to do`
                      : "Pick a teammate"}
                  </p>
                  <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-2">
                    Assign real work. They use their cloud computer — tools,
                    browser, files — and come back when they need you.
                  </p>
                </div>
              )}

              {(busy ||
                toolRows.length > 0 ||
                pending.length > 0 ||
                (live.length > 0 && workerStatus !== "idle")) &&
                active && (
                  <WorkBoard
                    workerName={active.name}
                    taskTitle={latestUserTask}
                    status={workerStatus}
                    rows={toolRows}
                  />
                )}

              {pending.map((req) => (
                <ApprovalCard
                  key={req.requestId}
                  request={req}
                  onRespond={(decision, options) =>
                    respondPermission(req.requestId, decision, options)
                  }
                />
              ))}

              {live.map((entry) => {
                if (entry.kind === "user") {
                  return (
                    <div key={entry.id} className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-ink-3">
                        You
                      </span>
                      <p className="text-[13.5px] leading-relaxed text-ink">
                        {entry.content}
                      </p>
                    </div>
                  );
                }
                if (entry.kind === "assistant") {
                  return (
                    <div key={entry.id} className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-ink-3">
                        {active?.name ?? "Sora"}
                      </span>
                      <StreamingText text={entry.content} />
                    </div>
                  );
                }
                return null;
              })}

              {error && (
                <p className="rounded-control bg-red-tint px-3 py-2 text-[13px] text-red">
                  {error}
                </p>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {showChatChrome && (
          <div className="shrink-0 border-t border-line bg-panel/80 px-5 py-3 backdrop-blur">
            <PromptBar
              disabled={busy || !active}
              placeholder={
                active
                  ? `Give ${active.name} a task…`
                  : "Pick a teammate first"
              }
              agents={agents.map((a) => ({
                key: a.slug,
                name: a.name,
                desc: a.description || a.model,
              }))}
              skills={skills.map((s) => ({
                key: s.id,
                name: `/${s.name}`,
                desc: s.description,
              }))}
              models={
                active
                  ? [
                      {
                        key: active.model,
                        name: active.model,
                        desc: "Bot model",
                      },
                      {
                        key: defaultModel,
                        name: defaultModel,
                        desc: "Workspace default",
                      },
                    ].filter(
                      (m, i, arr) =>
                        arr.findIndex((x) => x.key === m.key) === i,
                    )
                  : defaultModel
                    ? [
                        {
                          key: defaultModel,
                          name: defaultModel,
                          desc: "Default",
                        },
                      ]
                    : []
              }
              model={active?.model ?? defaultModel}
              onModelChange={(key) => {
                if (!active) return;
                void soraApi
                  .updateAgent(active.slug, { model: key })
                  .then(() => refresh())
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : String(err)),
                  );
              }}
              onSend={(text) => void send(text)}
            />
          </div>
        )}
      </main>

      {computerOpen && (
        <aside className="flex w-[300px] shrink-0 flex-col border-l border-line bg-panel">
          <div className="scroll-pane min-h-0 flex-1 p-4">
            <ComputerPanel
              agentSlug={selected}
              agentName={active?.name}
              activityRows={toolRows}
              connectedHint={workerStatus !== "idle"}
            />
          </div>
          <button
            type="button"
            onClick={() => setComputerOpen(false)}
            className="shrink-0 border-t border-line px-4 py-2 text-left text-[12px] text-ink-3 hover:bg-hover hover:text-ink"
          >
            Hide computer
          </button>
        </aside>
      )}
    </div>
  );
}
