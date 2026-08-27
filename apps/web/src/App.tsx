import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  connectEvents,
  soraApi,
  type Agent,
  type LiveEntry,
  type PendingPermission,
  type Skill,
  type Workflow,
} from "./api";
import {
  applyDocumentTheme,
  loadAppearance,
  measureImageLuminance,
  saveLeftPanelOpen,
  saveLeftWidth,
  saveRightPanelOpen,
  saveRightWidth,
  saveTheme,
  saveWallpaper,
  type ThemeMode,
} from "./appearance";
import ApprovalCard from "./components/ApprovalCard";
import AgentsPanel from "./components/AgentsPanel";
import AppearanceSettings from "./components/AppearanceSettings";
import BotMark from "./components/BotMark";
import ComputerPanel from "./components/ComputerPanel";
import CapabilitiesPanel from "./components/CapabilitiesPanel";
import ChatRoutines from "./components/ChatRoutines";
import ConfirmDialog from "./components/ConfirmDialog";
import Onboarding from "./components/Onboarding";
import PluginsPanel from "./components/PluginsPanel";
import PromptBar from "./components/PromptBar";
import ProviderSettings from "./components/ProviderSettings";
import RoutinesPanel from "./components/RoutinesPanel";
import SidebarNav, { teammateColor } from "./components/SidebarNav";
import StreamingText from "./components/StreamingText";
import MarkdownMessage from "./components/MarkdownMessage";
import type { ToolRow } from "./components/ToolChips";
import { isOpenDesktopLayout } from "./openLayout";
import { isReservedTeammateName } from "./teammateNames";

type WorkerStatus = "idle" | "working" | "needs_you" | "done" | "failed";

function parseSkillFromPrompt(prompt: string): {
  prompt: string;
  skill?: string;
} {
  const match = /^\/([\w-]+)\s*(.*)$/s.exec(prompt.trim());
  if (!match) return { prompt };
  return { skill: match[1], prompt: match[2]!.trim() || match[1]! };
}

function shortModelName(model: string): string {
  const raw = model.includes(":") ? model.split(":").pop()! : model;
  const leaf = raw.includes("/") ? raw.split("/").pop()! : raw;
  return leaf
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/Gpt/gi, "GPT")
    .replace(/Claude /i, "Claude ");
}

function friendlyToolLabel(raw: string): string {
  const n = raw.toLowerCase();
  if (n.includes("composio_list") || n.includes("list_connections"))
    return "Checking connected apps";
  if (n.includes("composio_search")) return "Finding app actions";
  if (n.includes("composio_execute") || n.includes("composio"))
    return "Using connected app";
  if (n.includes("agent_message") || n === "agent.message")
    return "Talking to teammate";
  if (n.includes("delegate")) return "Delegating to teammate";
  if (n.includes("web") || n.includes("search") || n.includes("browse"))
    return "Searching the web";
  if (n.includes("browser") || n.includes("navigate")) return "Using the browser";
  if (n.includes("read") || n.includes("fetch") || n.includes("http"))
    return "Reading sources";
  if (n.includes("terminal") || n.includes("shell") || n.includes("exec"))
    return "Running in terminal";
  if (n.includes("write") || n.includes("edit")) return "Editing files";
  if (n.includes("list") || n.includes("fs.")) return "Inspecting files";
  if (n.includes("screenshot")) return "Taking a screenshot";
  if (n.includes("memory")) return "Checking memory";
  return raw.replace(/[_.:]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
  const [defaultModel, setDefaultModel] = useState<string>("");
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [aiConnected, setAiConnected] = useState(false);
  const [computerReady, setComputerReady] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [saveRoutineBusy, setSaveRoutineBusy] = useState(false);
  const initialAppearance = useMemo(() => loadAppearance(), []);
  const [computerOpen, setComputerOpen] = useState(
    initialAppearance.rightPanelOpen,
  );
  const [leftPanelOpen, setLeftPanelOpen] = useState(
    initialAppearance.leftPanelOpen,
  );
  const [leftWidth, setLeftWidth] = useState(initialAppearance.leftWidth);
  const [rightWidth, setRightWidth] = useState(initialAppearance.rightWidth);
  const [wallpaper, setWallpaper] = useState<string | null>(
    initialAppearance.wallpaper,
  );
  const [themeMode, setThemeMode] = useState<ThemeMode>(
    initialAppearance.theme,
  );
  const [wallpaperLuminance, setWallpaperLuminance] = useState<number | null>(
    null,
  );
  const [vmControlUrl, setVmControlUrl] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [connectApps, setConnectApps] = useState<
    Array<{ key: string; name: string; desc: string }>
  >([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | null>(null);
  const agentsRef = useRef<Agent[]>([]);
  selectedRef.current = selected;
  agentsRef.current = agents;

  const active = useMemo(
    () => agents.find((a) => a.slug === selected) ?? null,
    [agents, selected],
  );

  async function refresh() {
    const [a, s, w, p, providers, config] = await Promise.all([
      soraApi.agents(),
      soraApi.skills(),
      soraApi.workflows(),
      soraApi.pendingPermissions().catch(() => [] as PendingPermission[]),
      soraApi.providers().catch(() => null),
      soraApi.getConfig().catch(() => null),
    ]);
    setAgents(a);
    setSkills(s);
    setWorkflows(w);
    setPending(p);
    if (config?.displayName) setDisplayName(config.displayName);
    if (providers) {
      setDefaultModel(providers.defaultModel);
      setAiConnected(
        providers.providers.some(
          (p) =>
            p.configured &&
            p.needsKey &&
            p.id !== "mock" &&
            p.kind !== "infra",
        ),
      );
      setComputerReady(
        Boolean(providers.providers.find((p) => p.id === "e2b")?.configured),
      );
    }
    setSelected((prev) => {
      if (prev && a.some((agent) => agent.slug === prev)) return prev;
      return a[0]?.slug ?? null;
    });
    try {
      const plug = await soraApi.plugins();
      const composio = plug.plugins.find((p) => p.id === "composio");
      const linked = composio?.configured
        ? await soraApi.composioConnections().catch(() => null)
        : null;
      const active = new Set(
        (linked?.connections ?? [])
          .filter((c) => c.status === "ACTIVE")
          .map((c) => c.slug.toLowerCase()),
      );
      const apps = (composio?.apps?.length
        ? composio.apps
        : [
            "gmail",
            "github",
            "slack",
            "googlecalendar",
            "twitter",
            "notion",
          ]
      ).map((app) => ({
        key: app,
        name:
          app === "twitter"
            ? "X"
            : app === "googlecalendar"
              ? "Google Calendar"
              : app.charAt(0).toUpperCase() + app.slice(1),
        desc: !composio?.configured
          ? "Needs Composio key first"
          : active.has(app.toLowerCase())
            ? "Connected"
            : "Link via browser login",
      }));
      setConnectApps(apps);
    } catch {
      setConnectApps([]);
    }
  }

  useEffect(() => {
    soraApi
      .health()
      .then(() => {
        setApiOk(true);
        return refresh();
      })
      .catch(() => setApiOk(false));

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    return connectEvents((event) => {
      const viewing = selectedRef.current;
      const eventSlug =
        typeof event.data?.slug === "string"
          ? event.data.slug
          : typeof event.data?.agentSlug === "string"
            ? event.data.agentSlug
            : null;
      const agentLabel = (slug: string | null | undefined) => {
        if (!slug) return undefined;
        if (viewing && slug === viewing) return undefined;
        return (
          agentsRef.current.find((a) => a.slug === slug)?.name ?? slug
        );
      };

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
      } else if (event.type === "agent.messaged" || event.type === "agent.delegated") {
        const from =
          String(event.data?.fromName ?? event.data?.from ?? "Teammate");
        const to = String(event.data?.toName ?? event.data?.to ?? "Teammate");
        const message = String(
          event.data?.message ?? event.data?.task ?? "",
        );
        const statusRaw = String(event.data?.status ?? "");
        const deliver = String(event.data?.deliver ?? "run");
        const status =
          statusRaw === "completed"
            ? "completed"
            : deliver === "queue"
              ? "queued"
              : "started";
        const reply =
          typeof event.data?.reply === "string" ? event.data.reply : undefined;
        setLive((prev) => {
          if (status === "completed") {
            const idx = [...prev]
              .reverse()
              .findIndex(
                (e) =>
                  e.kind === "handoff" &&
                  e.status === "started" &&
                  e.to === to &&
                  e.from === from,
              );
            if (idx >= 0) {
              const real = prev.length - 1 - idx;
              return prev.map((e, i) =>
                i === real && e.kind === "handoff"
                  ? { ...e, status: "completed", reply }
                  : e,
              );
            }
          }
          return [
            ...prev,
            {
              kind: "handoff",
              id: event.id,
              from,
              to,
              message,
              reply,
              status,
            },
          ];
        });
      } else if (event.type === "agent.text.started") {
        const streamId = String(event.data?.streamId ?? event.id);
        setLive((prev) => {
          // One live assistant bubble per turn — drop prior streamed drafts so
          // tool rounds don't leave duplicate full replies in the transcript.
          const kept = prev.filter(
            (e) => !(e.kind === "assistant" && e.streamId),
          );
          return [
            ...kept,
            {
              kind: "assistant" as const,
              id: streamId,
              streamId,
              content: "",
              streaming: true,
              fromAgent: agentLabel(eventSlug),
            },
          ];
        });
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
        if (
          typeof cid === "string" &&
          (!viewing || !eventSlug || eventSlug === viewing)
        ) {
          setConversationId(cid);
        }
      } else if (event.type === "agent.tool.started") {
        setLive((prev) => {
          // Hide empty draft bubbles so the chip sits under real text, not a blank.
          const cleaned = prev.filter(
            (e) =>
              !(
                e.kind === "assistant" &&
                e.streamId &&
                !e.content.trim()
              ),
          );
          return [
            ...cleaned,
            {
              kind: "tool" as const,
              id: event.id,
              name: String(event.data?.tool ?? "tool"),
              status: "started" as const,
            },
          ];
        });
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
      } else if (
        event.type === "agent.created" ||
        event.type === "agent.updated" ||
        event.type === "agent.deleted"
      ) {
        void refresh();
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

  useEffect(() => {
    let cancelled = false;
    if (!wallpaper) {
      setWallpaperLuminance(null);
      return;
    }
    void measureImageLuminance(wallpaper)
      .then((lum) => {
        if (!cancelled) setWallpaperLuminance(lum);
      })
      .catch(() => {
        if (!cancelled) setWallpaperLuminance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [wallpaper]);

  useEffect(() => {
    applyDocumentTheme(themeMode, wallpaperLuminance);
  }, [themeMode, wallpaperLuminance]);

  useEffect(() => {
    saveLeftPanelOpen(leftPanelOpen);
  }, [leftPanelOpen]);

  useEffect(() => {
    saveLeftWidth(leftWidth);
  }, [leftWidth]);

  useEffect(() => {
    saveRightWidth(rightWidth);
  }, [rightWidth]);

  useEffect(() => {
    saveRightPanelOpen(computerOpen);
    // Hiding the rail unmounts ComputerPanel. Drop Open layout so chat
    // does not stay pinned at 380px with an empty desktop column.
    if (!computerOpen) setVmControlUrl(null);
  }, [computerOpen]);

  function startResize(
    side: "left" | "right",
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    const startX = event.clientX;
    const startW = side === "left" ? leftWidth : rightWidth;
    const el = event.currentTarget;
    el.setPointerCapture(event.pointerId);
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (side === "left") {
        setLeftWidth(Math.min(420, Math.max(200, startW + dx)));
      } else {
        setRightWidth(Math.min(480, Math.max(260, startW - dx)));
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  async function loadConversation(id: string) {
    setConversationId(id);
    const msgs = await soraApi.messages(id);
    const entries: LiveEntry[] = [];
    for (const m of msgs) {
      if (m.role === "user") {
        entries.push({ kind: "user", id: m.id, content: m.content });
        continue;
      }
      if (m.role === "assistant") {
        const text = (m.content ?? "").trim();
        if (!text || text === "(empty response)") continue;
        const prev = entries[entries.length - 1];
        // Collapse consecutive identical assistant replies (legacy duplicate bug).
        if (
          prev?.kind === "assistant" &&
          prev.content.trim() === text
        ) {
          continue;
        }
        entries.push({ kind: "assistant", id: m.id, content: m.content });
      }
    }
    setLive(entries);
  }

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
        setChatTitle(latest.title || null);
        await loadConversation(latest.id);
      } catch {
        setConversationId(null);
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

  /** Teammates roster only: name + what they’re doing now. */
  const sidebarTeammates = useMemo(() => {
    return agents.map((a) => {
      const isActive = a.slug === selected;
      let activity = "Idle";
      if (isActive && workerStatus === "working") {
        activity =
          toolRows.find((r) => r.status === "started")?.label?.replace(
            /[_.:]/g,
            " ",
          ) ||
          latestUserTask?.slice(0, 48) ||
          "Working…";
      } else if (isActive && workerStatus === "needs_you") {
        activity = "Waiting for your approval";
      } else if (isActive && workerStatus === "done" && latestUserTask) {
        activity = latestUserTask.slice(0, 56);
      } else if (a.status === "running") {
        activity = "Working…";
      } else if (a.description?.trim()) {
        activity = a.description.trim().slice(0, 56);
      }
      return {
        id: `agent:${a.slug}`,
        label: a.name,
        role: a.description?.trim()?.slice(0, 32) || undefined,
        activity,
        color: a.accentColor?.trim() || teammateColor(a.slug),
      };
    });
  }, [agents, selected, workerStatus, toolRows, latestUserTask]);

  const activeListId = selected ? `agent:${selected}` : null;

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

  async function renameActiveTeammate() {
    if (!active) return;
    setHeaderMenuOpen(false);
    const next = window.prompt("Teammate name", active.name);
    if (next == null) return;
    const name = next.trim();
    if (!name || name === active.name) return;
    if (isReservedTeammateName(name)) {
      setError("That name is reserved for the app. Pick a teammate name.");
      return;
    }
    setError(null);
    try {
      await soraApi.updateAgent(active.slug, { name });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function requestDeleteActiveTeammate() {
    if (!active) return;
    setHeaderMenuOpen(false);
    setDeleteConfirmOpen(true);
  }

  async function confirmDeleteActiveTeammate() {
    if (!active || deleteBusy) return;
    const slug = active.slug;
    setDeleteBusy(true);
    setError(null);
    try {
      await soraApi.deleteAgent(slug);
      setDeleteConfirmOpen(false);
      setLive([]);
      setChatTitle(null);
      setConversationId(null);
      setSelected(null);
      await refresh();
      setNav("chats");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function runWithTeammate(
    slug: string,
    text: string,
    opts?: { conversationId?: string | null; resetChat?: boolean },
  ) {
    if (busy) return;
    const { prompt, skill } = parseSkillFromPrompt(text);
    const mention = /@([\w-]+)/.exec(prompt);
    let target = slug;
    let clean = prompt;
    if (mention) {
      const named = agents.find(
        (a) =>
          a.slug === mention[1] ||
          a.name.toLowerCase() === mention[1]!.toLowerCase(),
      );
      if (named) {
        target = named.slug;
        clean = prompt.replace(mention[0], "").trim() || prompt;
      }
    }

    setSelected(target);
    setError(null);
    setBusy(true);
    setChatTitle(clean.slice(0, 48) || "New chat");
    setNav("chats");
    if (opts?.resetChat) {
      setConversationId(null);
      setLive([{ kind: "user", id: crypto.randomUUID(), content: clean }]);
    } else {
      setLive((prev) => [
        ...prev,
        { kind: "user", id: crypto.randomUUID(), content: clean },
      ]);
    }

    try {
      const result = await soraApi.runAgent(target, {
        prompt: clean,
        skill,
        conversationId: opts?.resetChat
          ? undefined
          : (opts?.conversationId ?? conversationId ?? undefined),
      });
      setConversationId(result.conversationId);
      setLive((prev) => {
        // Keep users/tools/handoffs; collapse every streamed assistant into one final reply.
        // (Previously we rewrote ALL streamed assistants to result.reply, which duplicated the answer.)
        const kept = prev.filter(
          (e) => !(e.kind === "assistant" && e.streamId),
        );
        return [
          ...kept,
          {
            kind: "assistant" as const,
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

  async function send(text: string) {
    if (!active || busy) return;
    await runWithTeammate(active.slug, text);
  }

  /** Bot Directory: create shell → open chat → send listing setup prompt. */
  async function setupFromDirectory(agent: Agent, setupPrompt: string) {
    await refresh();
    setSelected(agent.slug);
    setNav("chats");
    await runWithTeammate(agent.slug, setupPrompt, { resetChat: true });
  }

  async function respondPermission(
    requestId: string,
    decision: "allow" | "deny",
    options?: { rememberSession?: boolean },
  ) {
    await soraApi.respondPermission(requestId, decision, options);
    setPending((prev) => prev.filter((p) => p.requestId !== requestId));
  }

  if (apiOk === null) {
    return (
      <div className="flex h-full items-center justify-center bg-panel px-6">
        <p className="text-[14px] text-ink-2">Starting Sora…</p>
      </div>
    );
  }

  if (apiOk === false) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-3xl font-semibold text-ink">Sora</p>
          <p className="mt-2 text-[14px] text-ink-2">
            Sora isn’t running yet. Open the desktop app again, or start it from
            your install folder.
          </p>
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <Onboarding
        onDone={(opts) => {
          setOnboardingDone(true);
          void refresh().then(async () => {
            setNav("chats");
            if (opts?.agentSlug && opts.setupPrompt) {
              setSelected(opts.agentSlug);
              await runWithTeammate(opts.agentSlug, opts.setupPrompt, {
                resetChat: true,
              });
            } else if (opts?.agentSlug) {
              setSelected(opts.agentSlug);
            }
          });
        }}
      />
    );
  }

  const showChatChrome = nav === "chats";

  return (
    <div
      className="relative flex h-full min-h-0 bg-page"
      style={
        wallpaper
          ? {
              backgroundImage: `url(${wallpaper})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      {wallpaper && (
        <div
          className="pointer-events-none absolute inset-0 bg-page/45"
          aria-hidden
        />
      )}
      <div className="relative z-10 flex h-full min-h-0 w-full">
      <SidebarNav
        fill
        displayName={displayName}
        activeId={nav === "chats" ? activeListId : null}
        activeNav={nav}
        onNavigate={setNav}
        width={leftWidth}
        teammates={sidebarTeammates}
        onPlugins={() => setNav("plugins")}
        onSettings={() => setNav("settings")}
        onNewTeammate={() => setNav("agents")}
        onPick={(id) => {
          if (!id.startsWith("agent:")) return;
          const slug = id.slice(6);
          setNav("chats");
          if (slug === selected) return;
          setSelected(slug);
        }}
      />
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize teammates panel"
        onPointerDown={(e) => startResize("left", e)}
        className="w-1 shrink-0 cursor-col-resize bg-transparent"
      />

      <main
        className={`flex min-h-0 flex-col bg-panel/80 ${
          isOpenDesktopLayout(computerOpen, vmControlUrl, showChatChrome)
            ? "w-[380px] shrink-0 border-r border-line"
            : "min-w-0 flex-1"
        }`}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {showChatChrome && active && (
              <BotMark
                color={
                  active.accentColor?.trim() || teammateColor(active.slug)
                }
                size={28}
              />
            )}
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold text-ink">
                {nav === "routines"
                  ? "Schedules"
                  : nav === "agents"
                    ? "New teammate"
                    : nav === "plugins"
                      ? "Plugin"
                      : nav === "settings"
                        ? "Settings"
                        : (active?.name ?? "Pick a teammate")}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {showChatChrome && active && (
              <>
                <button
                  type="button"
                  onClick={() => setComputerOpen((o) => !o)}
                  className={`flex size-8 cursor-pointer items-center justify-center rounded-control transition-transform duration-100 active:scale-[0.96] ${
                    computerOpen
                      ? "bg-field text-ink"
                      : "bg-field text-ink-2"
                  }`}
                  title="Computer"
                  aria-label={computerOpen ? "Hide computer" : "Show computer"}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <rect x="3" y="4" width="18" height="12" rx="2" />
                    <path d="M8 20h8M12 16v4" />
                  </svg>
                </button>
                <div className="relative" ref={headerMenuRef}>
                  <button
                    type="button"
                    aria-label="More actions"
                    onClick={() => setHeaderMenuOpen((o) => !o)}
                    className="flex size-8 cursor-pointer items-center justify-center rounded-control bg-field text-ink-2 transition-transform duration-100 active:scale-[0.96]"
                  >
                    ···
                  </button>
                  {headerMenuOpen && (
                    <div className="absolute top-full right-0 z-40 mt-1 w-52 rounded-[12px] bg-surface p-1 shadow-overlay">
                      <button
                        type="button"
                        onClick={() => {
                          setLive([]);
                          setChatTitle(null);
                          setConversationId(null);
                          setError(null);
                          setHeaderMenuOpen(false);
                        }}
                        className="flex h-9 w-full items-center rounded-[8px] px-2.5 text-left text-[13px] text-ink-2"
                      >
                        New task
                      </button>
                      <button
                        type="button"
                        disabled={
                          !conversationId ||
                          saveRoutineBusy ||
                          !toolRows.some((t) => t.status === "completed")
                        }
                        onClick={() => void saveChatAsRoutine()}
                        className="flex h-9 w-full items-center rounded-[8px] px-2.5 text-left text-[13px] text-ink-2 disabled:opacity-40"
                      >
                        Save as schedule
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHeaderMenuOpen(false);
                          setNav("agents");
                        }}
                        className="flex h-9 w-full items-center rounded-[8px] px-2.5 text-left text-[13px] text-ink-2"
                      >
                        Manage teammate
                      </button>
                      <button
                        type="button"
                        disabled={!active}
                        onClick={() => void renameActiveTeammate()}
                        className="flex h-9 w-full items-center rounded-[8px] px-2.5 text-left text-[13px] text-ink-2 disabled:opacity-40"
                      >
                        Rename
                      </button>
                      {(active
                        ? [
                            {
                              key: active.model,
                              name: shortModelName(active.model),
                            },
                            {
                              key: defaultModel,
                              name: shortModelName(defaultModel),
                            },
                          ].filter(
                            (m, i, arr) =>
                              m.key &&
                              arr.findIndex((x) => x.key === m.key) === i,
                          )
                        : []
                      ).map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false);
                            void soraApi
                              .updateAgent(active.slug, { model: m.key })
                              .then(() => refresh())
                              .catch((err) =>
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : String(err),
                                ),
                              );
                          }}
                          className="flex h-9 w-full items-center rounded-[8px] px-2.5 text-left text-[13px] text-ink-2"
                        >
                          Model {m.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={!active}
                        onClick={() => requestDeleteActiveTeammate()}
                        className="flex h-9 w-full items-center rounded-[8px] px-2.5 text-left text-[13px] text-red disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </header>

        <div className="scroll-pane min-h-0 flex-1 px-5 py-5">
          {error && nav !== "chats" && (
            <p className="mb-4 rounded-control bg-red-tint px-3 py-2 text-[13px] text-red">
              {error}
            </p>
          )}
          {nav === "settings" ? (
            <div className="flex flex-col gap-4">
              <AppearanceSettings
                wallpaper={wallpaper}
                theme={themeMode}
                onWallpaper={async (dataUrl) => {
                  if (!dataUrl) {
                    saveWallpaper(null);
                    setWallpaper(null);
                    return;
                  }
                  saveWallpaper(dataUrl);
                  setWallpaper(dataUrl);
                }}
                onTheme={(mode) => {
                  saveTheme(mode);
                  setThemeMode(mode);
                }}
              />
              <ProviderSettings onChanged={() => void refresh()} />
            </div>
          ) : nav === "plugins" ? (
            <PluginsPanel
              onChanged={() => void refresh()}
              onSetupFromDirectory={(agent, setupPrompt) =>
                void setupFromDirectory(agent, setupPrompt)
              }
            />
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
              onSetupFromDirectory={(agent, setupPrompt) =>
                void setupFromDirectory(agent, setupPrompt)
              }
            />
          ) : (
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
              {live.length === 0 && !busy && (
                <div className="py-16">
                  <p className="text-[17px] font-semibold text-ink">
                    {active ? `Message ${active.name}` : "Pick a teammate"}
                  </p>
                  <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-2">
                    Assign real work. They use their computer: tools, browser,
                    files. They come back when they need you.
                  </p>
                </div>
              )}

              {live.map((entry) => {
                if (entry.kind === "user") {
                  return (
                    <div key={entry.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-[18px] bg-field px-3.5 py-2.5 text-[14px] leading-relaxed text-ink">
                        {entry.content}
                      </div>
                    </div>
                  );
                }
                if (entry.kind === "assistant") {
                  // Hide empty mid-tool stream bubbles; keep the latest streaming one visible.
                  if (!entry.content.trim() && !entry.streaming) return null;
                  return (
                    <div key={entry.id} className="flex justify-start">
                      <div className="max-w-[92%] rounded-[18px] bg-inset px-3.5 py-2.5">
                        {entry.fromAgent ? (
                          <p className="mb-1 text-[11px] font-medium tracking-wide text-ink-3">
                            {entry.fromAgent}
                          </p>
                        ) : null}
                        {entry.streaming ? (
                          <StreamingText
                            text={entry.content}
                            animate={false}
                            fill={false}
                          />
                        ) : (
                          <MarkdownMessage text={entry.content} />
                        )}
                      </div>
                    </div>
                  );
                }
                if (entry.kind === "handoff") {
                  const waiting = entry.status === "started";
                  return (
                    <div
                      key={entry.id}
                      className="rounded-[12px] border border-line bg-field/60 px-3 py-2.5 text-[13px]"
                    >
                      <p className="font-medium text-ink">
                        {entry.from} → {entry.to}
                        {waiting ? "…" : entry.status === "queued" ? " (note)" : ""}
                      </p>
                      {entry.message ? (
                        <p className="mt-1 text-ink-2">{entry.message}</p>
                      ) : null}
                      {entry.reply ? (
                        <div className="mt-2 border-t border-line pt-2">
                          <p className="text-[11px] font-medium tracking-wide text-ink-3">
                            {entry.to} replied
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-ink">
                            {entry.reply}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                }
                if (entry.kind === "tool") {
                  const activeTool = entry.status === "started";
                  const failed = entry.status === "failed";
                  const mark = failed ? "✗" : activeTool ? "◉" : "✓";
                  return (
                    <div
                      key={entry.id}
                      className="flex items-start gap-2 pl-1 text-[13px]"
                    >
                      <span
                        className={`mt-0.5 shrink-0 ${
                          failed
                            ? "text-red"
                            : activeTool
                              ? "text-accent"
                              : "text-green"
                        }`}
                      >
                        {mark}
                      </span>
                      <span
                        className={
                          activeTool ? "font-medium text-ink" : "text-ink-2"
                        }
                      >
                        {friendlyToolLabel(entry.name)}
                        {activeTool ? "…" : ""}
                      </span>
                    </div>
                  );
                }
                return null;
              })}

              {pending.map((req) => (
                <ApprovalCard
                  key={req.requestId}
                  request={req}
                  onRespond={(decision, options) =>
                    respondPermission(req.requestId, decision, options)
                  }
                />
              ))}

              {busy && (
                <p className="flex items-center gap-2 text-[13px] text-ink-2">
                  <span
                    className="size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
                    style={{ animation: "spin 700ms linear infinite" }}
                    aria-hidden
                  />
                  <span>
                    {toolRows.find((r) => r.status === "started")
                      ? `${friendlyToolLabel(
                          toolRows.find((r) => r.status === "started")!.label,
                        )}…`
                      : `${active?.name ?? "Teammate"} is thinking…`}
                  </span>
                </p>
              )}

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
          <div className="shrink-0 border-t border-line bg-panel/80 px-5 py-3">
            <PromptBar
              disabled={!active}
              sending={busy}
              placeholder={
                active ? `Message ${active.name}` : "Pick a teammate first"
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
              connections={connectApps}
              models={[]}
              onSend={(text) => void send(text)}
              onManageConnections={() => setNav("plugins")}
              onConnect={(app) => {
                void (async () => {
                  try {
                    const result = await soraApi.connectPlugin("composio", app);
                    if (result.redirectUrl) {
                      const { openExternalUrl } = await import("./openExternal");
                      await openExternalUrl(result.redirectUrl);
                      // Re-check status after the browser login window.
                      window.setTimeout(() => void refresh(), 2500);
                    } else if (!result.ok) {
                      setError(
                        result.message ||
                          "Add a Composio key under Connected apps first.",
                      );
                      setNav("plugins");
                    } else {
                      setError(null);
                      await refresh();
                    }
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : String(err),
                    );
                    setNav("plugins");
                  }
                })();
              }}
            />
          </div>
        )}
      </main>

      {computerOpen && showChatChrome && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize computer panel"
            onPointerDown={(e) => startResize("right", e)}
            className="w-1 shrink-0 cursor-col-resize bg-transparent"
          />
          <aside
            className={`flex shrink-0 flex-col border-l border-line bg-panel/80 ${
              vmControlUrl ? "min-w-0 flex-1 border-l-0" : ""
            }`}
            style={vmControlUrl ? undefined : { width: rightWidth }}
          >
          <div
            className={`flex min-h-0 flex-1 flex-col ${
              vmControlUrl ? "gap-0 p-3" : "gap-5 p-4"
            }`}
          >
            <div className={vmControlUrl ? "flex min-h-0 flex-1 flex-col" : ""}>
              <ComputerPanel
                compact
                fillWindow={Boolean(vmControlUrl)}
                agentSlug={selected}
                agentName={active?.name}
                working={workerStatus === "working"}
                onControlChange={setVmControlUrl}
              />
            </div>
            {!vmControlUrl && (
              <>
                <div className="shrink-0 border-t border-line pt-4">
                  <CapabilitiesPanel
                    agentSlug={selected}
                    agentName={active?.name}
                  />
                </div>
                <div className="min-h-0 flex-1 border-t border-line pt-4">
                  <ChatRoutines
                    workflows={workflows}
                    agentSlug={selected}
                    onAdd={() => setNav("routines")}
                    onOpenAll={() => setNav("routines")}
                  />
                </div>
              </>
            )}
          </div>
          </aside>
        </>
      )}
      </div>
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete teammate?"
        message={
          active
            ? `Delete "${active.name}"? Their chat history stays on this PC, but the teammate will be removed. This cannot be undone.`
            : "Delete this teammate? This cannot be undone."
        }
        confirmLabel="Delete"
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setDeleteConfirmOpen(false);
        }}
        onConfirm={() => void confirmDeleteActiveTeammate()}
      />
    </div>
  );
}