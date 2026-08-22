import { useEffect, useMemo, useRef, useState } from "react";
import {
  connectEvents,
  soraApi,
  type Agent,
  type LiveEntry,
  type Skill,
  type Workflow,
} from "./api";

export function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [tools, setTools] = useState<Array<{ name: string; description: string }>>(
    [],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [skill, setSkill] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [live, setLive] = useState<LiveEntry[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  const active = useMemo(
    () => agents.find((a) => a.slug === selected) ?? null,
    [agents, selected],
  );

  async function refresh() {
    const [a, s, w, t] = await Promise.all([
      soraApi.agents(),
      soraApi.skills(),
      soraApi.workflows(),
      soraApi.tools(),
    ]);
    setAgents(a);
    setSkills(s);
    setWorkflows(w);
    setTools(t);
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
      if (event.type === "agent.tool.started") {
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
              ? { ...e, status: "completed", detail: String(event.data?.output ?? "") }
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
      } else if (event.type === "permission.requested") {
        setLive((prev) => [
          ...prev,
          {
            kind: "event",
            id: event.id,
            type: "permission",
            detail: `${event.data?.action} → ${event.data?.decision}`,
          },
        ]);
      } else if (event.type === "agent.delegated") {
        setLive((prev) => [
          ...prev,
          {
            kind: "event",
            id: event.id,
            type: "delegated",
            detail: `${event.data?.from} → ${event.data?.to}`,
          },
        ]);
      }
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [live]);

  useEffect(() => {
    if (!busy) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      return;
    }
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      setElapsed((n) => n + 0.1);
    }, 100);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [busy]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !prompt.trim() || busy) return;
    const text = prompt.trim();
    const skillName = skill || undefined;
    setPrompt("");
    setError(null);
    setBusy(true);
    setLive((prev) => [
      ...prev,
      { kind: "user", id: `u_${Date.now()}`, content: text },
    ]);

    try {
      const result = await soraApi.runAgent(active.slug, {
        prompt: text,
        skill: skillName,
      });
      setLive((prev) => [
        ...prev,
        {
          kind: "assistant",
          id: `a_${Date.now()}`,
          content: result.reply,
        },
      ]);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createQuickAgent() {
    const name = window.prompt("Agent name");
    if (!name?.trim()) return;
    try {
      await soraApi.createAgent({ name: name.trim() });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (apiOk === false) {
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="max-w-md text-center">
          <h1 className="font-display text-4xl tracking-tight">Sora</h1>
          <p className="mt-3 text-muted">
            Runtime API is offline. In another terminal:
          </p>
          <pre className="mt-4 rounded-lg bg-ink px-4 py-3 text-left font-mono text-sm text-panel">
            bun run sora start --yes
          </pre>
          <p className="mt-3 text-sm text-muted">
            Then keep <code className="font-mono">bun run dev:web</code> running.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line/80 bg-panel/80 px-5 py-3 backdrop-blur">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-3xl leading-none tracking-tight">
            Sora
          </h1>
          <span className="text-sm text-muted">local agent workspace</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="inline-flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${apiOk ? "bg-ok animate-pulse-dot" : "bg-muted"}`}
            />
            {apiOk ? "runtime connected" : "connecting…"}
          </span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
        {/* Agents */}
        <aside className="flex min-h-0 flex-col border-r border-line/80 bg-panel/60">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Agents
            </h2>
            <button
              type="button"
              onClick={createQuickAgent}
              className="text-xs font-medium text-accent hover:underline"
            >
              New
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {agents.length === 0 && (
              <p className="px-2 text-sm text-muted">
                No agents yet. Create one to begin.
              </p>
            )}
            {agents.map((agent) => {
              const on = agent.slug === selected;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelected(agent.slug)}
                  className={`mb-1 w-full rounded-lg px-3 py-2.5 text-left transition ${
                    on
                      ? "bg-ink text-panel"
                      : "hover:bg-white/70 text-ink"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{agent.name}</span>
                    <StatusDot status={agent.status} active={on} />
                  </div>
                  <p
                    className={`mt-0.5 line-clamp-2 text-xs ${on ? "text-panel/70" : "text-muted"}`}
                  >
                    {agent.description || agent.model}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="border-t border-line/80 px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Routines
            </h3>
            <ul className="mt-2 space-y-1.5">
              {workflows.length === 0 && (
                <li className="text-xs text-muted">No workflows yet</li>
              )}
              {workflows.slice(0, 6).map((wf) => (
                <li key={wf.id} className="text-xs">
                  <span className="font-medium">{wf.name}</span>
                  <span className="text-muted"> · {wf.trigger.type}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Conversation */}
        <main className="flex min-h-0 flex-col">
          <div className="border-b border-line/80 px-5 py-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl tracking-tight">
                  {active?.name ?? "Select an agent"}
                </h2>
                <p className="text-sm text-muted">
                  {active
                    ? active.description || active.model
                    : "Choose an agent from the left"}
                </p>
              </div>
              {busy && (
                <div className="animate-fade-up rounded-full bg-accent-soft px-3 py-1 font-mono text-xs text-accent">
                  Working · {elapsed.toFixed(1)}s
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {live.length === 0 && (
              <div className="animate-fade-up mx-auto mt-16 max-w-md text-center">
                <p className="font-display text-3xl text-ink-soft">
                  Ask {active?.name ?? "an agent"} to get started
                </p>
                <p className="mt-2 text-sm text-muted">
                  Try{" "}
                  <button
                    type="button"
                    className="text-accent underline-offset-2 hover:underline"
                    onClick={() => setPrompt("hello")}
                  >
                    hello
                  </button>
                  {skills[0] && (
                    <>
                      {" "}
                      or{" "}
                      <button
                        type="button"
                        className="text-accent underline-offset-2 hover:underline"
                        onClick={() => {
                          setSkill(skills[0]!.id);
                          setPrompt(`/${skills[0]!.id}`);
                        }}
                      >
                        /{skills[0].id}
                      </button>
                    </>
                  )}
                </p>
              </div>
            )}

            <div className="mx-auto flex max-w-2xl flex-col gap-3">
              {live.map((entry) => (
                <LiveRow key={entry.id} entry={entry} />
              ))}
              <div ref={bottomRef} />
            </div>
          </div>

          <form
            onSubmit={onSend}
            className="border-t border-line/80 bg-panel/90 px-5 py-4 backdrop-blur"
          >
            {error && (
              <p className="mb-2 text-sm text-danger">{error}</p>
            )}
            <div className="mx-auto flex max-w-2xl flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <select
                  value={skill}
                  onChange={(e) => setSkill(e.target.value)}
                  className="rounded-md border border-line bg-white px-2 py-1.5 text-xs"
                >
                  <option value="">No skill</option>
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      /{s.id}
                    </option>
                  ))}
                </select>
                <span className="self-center text-xs text-muted">
                  model {active?.model ?? "—"}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    active
                      ? `Message ${active.name}…`
                      : "Select an agent first"
                  }
                  disabled={!active || busy}
                  className="min-w-0 flex-1 rounded-xl border border-line bg-white px-4 py-3 outline-none ring-accent/30 focus:ring-2"
                />
                <button
                  type="submit"
                  disabled={!active || busy || !prompt.trim()}
                  className="rounded-xl bg-ink px-5 py-3 text-sm font-medium text-panel transition enabled:hover:bg-ink-soft disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            </div>
          </form>
        </main>

        {/* Context */}
        <aside className="hidden min-h-0 flex-col border-l border-line/80 bg-panel/60 lg:flex">
          <div className="px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Context
            </h2>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
            {active ? (
              <>
                <section>
                  <h3 className="text-sm font-semibold">{active.name}</h3>
                  <p className="mt-1 text-xs text-muted">{active.description}</p>
                  <dl className="mt-3 space-y-1.5 text-xs">
                    <Row label="Status" value={active.status} />
                    <Row label="Model" value={active.model} />
                    <Row
                      label="Capabilities"
                      value={active.capabilities.join(", ") || "—"}
                    />
                  </dl>
                </section>

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Tools
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {active.tools.map((t) => (
                      <span
                        key={t.name}
                        className="rounded-md bg-white px-2 py-1 font-mono text-[11px] text-ink-soft ring-1 ring-line"
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Skills
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {skills.length === 0 && (
                      <li className="text-xs text-muted">
                        Install with{" "}
                        <code className="font-mono">sora skill install</code>
                      </li>
                    )}
                    {skills.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="text-left text-sm text-accent hover:underline"
                          onClick={() => {
                            setSkill(s.id);
                            setPrompt(`/${s.id}`);
                          }}
                        >
                          /{s.id}
                        </button>
                        <p className="text-xs text-muted">{s.description}</p>
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Computer
                  </h3>
                  <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted break-all">
                    {active.workspace ??
                      `~/.sora/agents/${active.slug}/workspace`}
                  </p>
                </section>
              </>
            ) : (
              <p className="text-sm text-muted">Select an agent</p>
            )}

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Runtime tools
              </h3>
              <p className="mt-1 text-xs text-muted">
                {tools.length} registered
              </p>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StatusDot({
  status,
  active,
}: {
  status: string;
  active?: boolean;
}) {
  const color =
    status === "running"
      ? "bg-ok"
      : status === "error"
        ? "bg-danger"
        : active
          ? "bg-panel/50"
          : "bg-line";
  return (
    <span
      className={`h-1.5 w-1.5 rounded-full ${color} ${status === "running" ? "animate-pulse-dot" : ""}`}
      title={status}
    />
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function LiveRow({ entry }: { entry: LiveEntry }) {
  if (entry.kind === "user") {
    return (
      <div className="animate-fade-up ml-8 rounded-2xl bg-ink px-4 py-3 text-sm text-panel">
        {entry.content}
      </div>
    );
  }
  if (entry.kind === "assistant") {
    return (
      <div className="animate-fade-up mr-8 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-line">
        <pre className="whitespace-pre-wrap font-sans">{entry.content}</pre>
      </div>
    );
  }
  if (entry.kind === "tool") {
    const tone =
      entry.status === "failed"
        ? "border-danger/30 text-danger"
        : entry.status === "completed"
          ? "border-ok/30 text-ok"
          : "border-accent/30 text-accent";
    return (
      <div
        className={`animate-fade-up inline-flex max-w-full items-center gap-2 rounded-full border bg-white/80 px-3 py-1.5 font-mono text-[11px] ${tone}`}
      >
        <span>
          {entry.status === "started"
            ? "→"
            : entry.status === "completed"
              ? "✓"
              : "✗"}{" "}
          {entry.name}
        </span>
        {entry.status === "started" && (
          <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-current" />
        )}
      </div>
    );
  }
  return (
    <div className="animate-fade-up text-xs text-muted">
      {entry.type}
      {entry.detail ? ` · ${entry.detail}` : ""}
    </div>
  );
}
