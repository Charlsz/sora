import { useEffect, useState } from "react";
import {
  apiOrigin,
  soraApi,
  type Agent,
  type Workflow,
  type WorkflowRun,
} from "../api";
import TaskRows, { type TaskRowData } from "./TaskRows";

const CRON_PRESETS = [
  { id: "", label: "No schedule (manual / webhook only)" },
  { id: "0 7 * * *", label: "Every day at 7:00" },
  { id: "0 9 * * 1-5", label: "Weekdays at 9:00" },
  { id: "0 * * * *", label: "Every hour" },
  { id: "custom", label: "Custom cron…" },
] as const;

function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function webhookUrl(path: string): string {
  return `${apiOrigin()}/api/hooks/${path}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function formatRun(run: WorkflowRun): { label: string; meta: string } {
  const when = run.startedAt?.slice(0, 19).replace("T", " ") ?? "–";
  const detail =
    run.status === "failed"
      ? (run.error ?? "failed").slice(0, 48)
      : (run.reply ?? run.triggerType).slice(0, 48);
  return { label: `${run.status} · ${when}`, meta: detail };
}

export default function RoutinesPanel({
  agents,
  workflows,
  onChanged,
  onError,
}: {
  agents: Agent[];
  workflows: Workflow[];
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [agent, setAgent] = useState(agents[0]?.slug ?? "");
  const [task, setTask] = useState("");
  const [cronPreset, setCronPreset] = useState("");
  const [cronCustom, setCronCustom] = useState("");
  const [webhook, setWebhook] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [runsBySlug, setRunsBySlug] = useState<Record<string, WorkflowRun[]>>(
    {},
  );

  const cron =
    cronPreset === "custom"
      ? cronCustom.trim()
      : cronPreset === ""
        ? ""
        : cronPreset;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        workflows.map(async (w) => {
          try {
            const runs = await soraApi.workflowRuns(w.slug, 5);
            return [w.slug, runs] as const;
          } catch {
            return [w.slug, [] as WorkflowRun[]] as const;
          }
        }),
      );
      if (!cancelled) {
        setRunsBySlug(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workflows]);

  const rows: TaskRowData[] = workflows.map((w) => {
    const webhookPath =
      w.trigger.type === "webhook" ? w.trigger.path : undefined;
    const runs = runsBySlug[w.slug] ?? [];
    return {
      key: w.slug,
      label: w.name,
      meta: w.enabled ? w.trigger.type : `${w.trigger.type} · paused`,
      status: w.enabled ? "pending" : "failed",
      enabled: w.enabled,
      details: [
        { label: "Agent", meta: w.agentSlug },
        { label: "Task", meta: w.task.slice(0, 64) },
        ...(w.skill ? [{ label: "Skill", meta: w.skill }] : []),
        ...(w.trigger.type === "cron" && w.trigger.expression
          ? [{ label: "Cron", meta: w.trigger.expression }]
          : []),
        ...(webhookPath
          ? [{ label: "Webhook", meta: webhookUrl(webhookPath) }]
          : []),
        ...(runs.length
          ? runs.map((r) => formatRun(r))
          : [{ label: "Runs", meta: "No runs yet" }]),
      ],
    };
  });

  async function create() {
    if (!name.trim() || !agent.trim() || !task.trim()) {
      onError("Name, agent, and task are required");
      return;
    }
    setBusy(true);
    try {
      const webhookPath =
        webhook.trim() || slugifyName(name) || undefined;
      await soraApi.createWorkflow({
        name: name.trim(),
        agent: agent.trim(),
        task: task.trim(),
        cron: cron || undefined,
        webhook: !cron && webhookPath ? webhookPath : undefined,
      });
      setName("");
      setTask("");
      setCronPreset("");
      setCronCustom("");
      setWebhook("");
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(key: string, text: string) {
    const ok = await copyText(text);
    if (ok) {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Schedules</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          Local-only: cron fires only while Sora is open on this computer. If the
          app is closed, scheduled runs wait until you open it again — nothing
          runs in the cloud.
        </p>
      </div>

      <section className="rounded-card bg-surface px-4 py-3 shadow-card">
        <h3 className="text-[13px] font-medium text-ink">New routine</h3>
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!webhook) {
                const s = slugifyName(e.target.value);
                if (s) setWebhook(s);
              }
            }}
            placeholder="Name (e.g. morning-brief)"
            className="h-9 rounded-control border border-line bg-field px-3 text-[13px] text-ink outline-none focus:border-line-strong"
          />
          <select
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            className="h-9 rounded-control border border-line bg-field px-3 text-[13px] text-ink"
          >
            {agents.length === 0 && (
              <option value="">Create an agent first</option>
            )}
            {agents.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name}
              </option>
            ))}
          </select>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={3}
            placeholder="Task prompt the agent will run"
            className="rounded-control border border-line bg-field px-3 py-2 text-[13px] text-ink outline-none focus:border-line-strong"
          />
          <label className="text-[11.5px] text-ink-3">Schedule</label>
          <select
            value={cronPreset}
            onChange={(e) => setCronPreset(e.target.value)}
            className="h-9 rounded-control border border-line bg-field px-3 text-[13px] text-ink"
          >
            {CRON_PRESETS.map((p) => (
              <option key={p.id || "none"} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {cronPreset === "custom" && (
            <input
              value={cronCustom}
              onChange={(e) => setCronCustom(e.target.value)}
              placeholder="0 7 * * 1-5"
              className="h-9 rounded-control border border-line bg-field px-3 font-mono text-[12.5px] text-ink outline-none focus:border-line-strong"
            />
          )}
          {!cron && (
            <>
              <label className="text-[11.5px] text-ink-3">
                Webhook path (POST /api/hooks/…)
              </label>
              <div className="flex gap-2">
                <input
                  value={webhook}
                  onChange={(e) => setWebhook(e.target.value)}
                  placeholder="morning-brief"
                  className="min-w-0 flex-1 h-9 rounded-control border border-line bg-field px-3 font-mono text-[12.5px] text-ink outline-none focus:border-line-strong"
                />
                {webhook.trim() && (
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopy("draft", webhookUrl(webhook.trim()))
                    }
                    className="shrink-0 rounded-control bg-field px-2.5 py-1.5 text-[12px] text-ink-2 hover:bg-hover"
                  >
                    {copied === "draft" ? "Copied" : "Copy URL"}
                  </button>
                )}
              </div>
              {webhook.trim() && (
                <p className="font-mono text-[10.5px] break-all text-ink-3">
                  {webhookUrl(webhook.trim())}
                </p>
              )}
            </>
          )}
          <button
            type="button"
            disabled={busy || agents.length === 0}
            onClick={() => void create()}
            className="self-start rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create routine"}
          </button>
        </div>
      </section>

      <TaskRows
        rows={rows}
        onRun={(slug) => {
          void soraApi
            .runWorkflow(slug)
            .then(() => onChanged())
            .catch((err) =>
              onError(err instanceof Error ? err.message : String(err)),
            );
        }}
        onToggle={(slug, enabled) => {
          void soraApi
            .setWorkflowEnabled(slug, enabled)
            .then(() => onChanged())
            .catch((err) =>
              onError(err instanceof Error ? err.message : String(err)),
            );
        }}
        onDelete={(slug) => {
          if (!window.confirm(`Delete routine "${slug}"?`)) return;
          void soraApi
            .deleteWorkflow(slug)
            .then(() => onChanged())
            .catch((err) =>
              onError(err instanceof Error ? err.message : String(err)),
            );
        }}
        onCopy={(key, text) => void handleCopy(key, text)}
        copiedKey={copied}
      />
    </div>
  );
}
