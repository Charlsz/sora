import { useEffect, useMemo, useRef, useState } from "react";
import {
  connectEvents,
  soraApi,
  type Agent,
  type LiveEntry,
  type PendingPermission,
  type Skill,
  type Workflow,
} from "./api";
import ApprovalCard from "./components/ApprovalCard";
import AgentsPanel from "./components/AgentsPanel";
import ComputerPanel from "./components/ComputerPanel";
import ContextCards from "./components/ContextCards";
import LoadingState from "./components/LoadingState";
import Onboarding from "./components/Onboarding";
import PluginsPanel from "./components/PluginsPanel";
import PromptBar from "./components/PromptBar";
import ProviderSettings from "./components/ProviderSettings";
import RoutinesPanel from "./components/RoutinesPanel";
import SidebarNav from "./components/SidebarNav";
import StreamingText from "./components/StreamingText";
import ThinkingState from "./components/ThinkingState";
import ToolChips, { type ToolRow } from "./components/ToolChips";

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
  const [defaultModel, setDefaultModel] = useState<string>("mock:echo");
  const [onboardingDone, setOnboardingDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    if (providers) setDefaultModel(providers.defaultModel);
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
        // Resolved — drop matching pending by agent/action/resource if still listed
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
    if (!selected) {
      setConversationId(null);
      setLive([]);
      return;
    }
    void (async () => {
      try {
        const convs = await soraApi.conversations(selected);
        if (convs.length === 0) {
          setConversationId(null);
          setLive([]);
          return;
        }
        const latest = convs[0]!;
        setConversationId(latest.id);
        setChatTitle(latest.title || null);
        const msgs = await soraApi.messages(latest.id);
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
      } catch {
        setConversationId(null);
        setLive([]);
      }
    })();
  }, [selected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [live.length, busy, pending.length]);

  const showOnboarding = apiOk && agents.length === 0 && !onboardingDone;

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

  const contextChunks = toolRows
    .filter((r) => r.status === "completed" && r.detail?.length)
    .map((r) => ({
      title: r.label,
      body: r.detail!.join("\n").slice(0, 400),
      source: r.label,
      badge: "TOOL",
      chars: `${r.detail!.join("\n").length} chars`,
    }));

  const recents = [
    ...agents.map((a) => ({
      id: `agent:${a.slug}`,
      label: a.name,
      prompt: undefined as string | undefined,
    })),
    ...workflows.map((w) => ({
      id: `wf:${w.slug}`,
      label: w.name,
      prompt: w.task,
    })),
  ];

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
  ) {
    await soraApi.respondPermission(requestId, decision);
    setPending((prev) => prev.filter((p) => p.requestId !== requestId));
  }

  if (apiOk === false) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="font-display text-3xl text-ink">Sora</p>
          <p className="mt-2 text-[14px] text-ink-2">
            API is offline. Start the local runtime, then reload.
          </p>
          <pre className="mt-4 rounded-card bg-ink px-4 py-3 text-left font-mono text-[12px] text-surface">
            bun run sora start
          </pre>
          <p className="mt-3 text-[12px] text-ink-3">
            Use <code className="font-mono">--yes</code> only for headless
            auto-approve.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <SidebarNav
        fill
        brand="Sora"
        monogram="S"
        activeTitle={chatTitle}
        activeNav={nav}
        onNavigate={setNav}
        recents={recents}
        navItems={[
          { key: "agents", label: "Agents", count: String(agents.length) },
          {
            key: "routines",
            label: "Routines",
            count: String(workflows.length),
          },
          { key: "plugins", label: "Plugins" },
          { key: "settings", label: "Models" },
        ]}
        footerLabel={apiOk ? "Runtime online" : "Connecting…"}
        onFooterClick={() => setNav("settings")}
        onNewChat={() => {
          setLive([]);
          setChatTitle(null);
          setConversationId(null);
          setError(null);
          setNav("chats");
        }}
        onPick={(id, label, prompt) => {
          if (id.startsWith("agent:")) {
            setSelected(id.slice(6));
            setNav("chats");
            setChatTitle(label);
          } else if (id.startsWith("wf:")) {
            setNav("routines");
            if (prompt) void send(prompt);
          }
        }}
      />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h1 className="text-[15px] font-semibold text-ink">
              {active?.name ?? "Select an agent"}
            </h1>
            <p className="text-[12px] text-ink-3">
              {active
                ? `${active.model} · default ${defaultModel}`
                : `Local-first · ${defaultModel}`}
            </p>
          </div>
          {busy && <LoadingState label="Agent working" variant="Dots" />}
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
                <div className="py-10">
                  <p className="font-display text-3xl text-ink">Sora</p>
                  <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink-2">
                    Open-source alternative to closed agent bots. Run agents
                    locally, approve what they touch, and keep your workspace
                    yours.
                  </p>
                  <div className="mt-6">
                    <ThinkingState
                      activeLabel="Ready when you are"
                      doneLabel="Local runtime"
                      rows={[
                        { primary: "Permission gate armed" },
                        { primary: "Skills & tools discovered" },
                        {
                          primary: "SSE event stream",
                          secondary: "live",
                          mono: true,
                        },
                      ]}
                    />
                  </div>
                </div>
              )}

              {live.map((entry) => {
                if (entry.kind === "user") {
                  return (
                    <div key={entry.id} className="flex justify-end pl-10">
                      <div className="rounded-xl bg-field px-3 py-1.5 text-[13px] leading-[1.4] text-ink">
                        {entry.content}
                      </div>
                    </div>
                  );
                }
                if (entry.kind === "assistant") {
                  return (
                    <StreamingText key={entry.id} text={entry.content} />
                  );
                }
                return null;
              })}

              {toolRows.length > 0 && <ToolChips rows={toolRows} />}

              {busy && live.every((e) => e.kind !== "assistant" || !e.streaming) && (
                <LoadingState label="Churning" />
              )}

              {pending.map((req) => (
                <ApprovalCard
                  key={req.requestId}
                  request={req}
                  onRespond={(decision) =>
                    respondPermission(req.requestId, decision)
                  }
                />
              ))}

              {error && (
                <p className="rounded-control bg-red-tint px-3 py-2 text-[13px] text-red">
                  {error}
                </p>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {nav === "chats" && !showOnboarding && (
          <div className="shrink-0 border-t border-line bg-panel/80 px-5 py-3 backdrop-blur">
            <PromptBar
              disabled={busy || !active}
              placeholder={
                active
                  ? `Message ${active.name}…  @agent  /skill`
                  : "Create or select an agent first"
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
                        desc: "Agent model",
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
              onSend={(text) => void send(text)}
            />
          </div>
        )}
      </main>

      <aside className="hidden w-80 shrink-0 flex-col gap-6 border-l border-line bg-panel/70 p-4 lg:flex">
        <ComputerPanel agentSlug={selected} />
        <ContextCards chunks={contextChunks} />
        {active?.workspace && (
          <p className="font-mono text-[11px] break-all text-ink-3">
            {active.workspace}
          </p>
        )}
      </aside>
    </div>
  );
}
