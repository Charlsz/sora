import { useState } from "react";
import { soraApi, type Agent, type Workflow } from "../api";
import TaskRows, { type TaskRowData } from "./TaskRows";

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
  const [cron, setCron] = useState("");
  const [busy, setBusy] = useState(false);

  const rows: TaskRowData[] = workflows.map((w) => ({
    key: w.slug,
    label: w.name,
    meta: w.trigger.type,
    status: w.enabled ? "pending" : "failed",
    details: [
      { label: "Agent", meta: w.agentSlug },
      { label: "Task", meta: w.task.slice(0, 64) },
      ...(w.skill ? [{ label: "Skill", meta: w.skill }] : []),
      ...(w.trigger.expression
        ? [{ label: "Cron", meta: w.trigger.expression }]
        : []),
    ],
  }));

  async function create() {
    if (!name.trim() || !agent.trim() || !task.trim()) {
      onError("Name, agent, and task are required");
      return;
    }
    setBusy(true);
    try {
      await soraApi.createWorkflow({
        name: name.trim(),
        agent: agent.trim(),
        task: task.trim(),
        cron: cron.trim() || undefined,
      });
      setName("");
      setTask("");
      setCron("");
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Routines</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          Scheduled or manual workflows — same idea as Grok Bot routines.
        </p>
      </div>

      <section className="rounded-card bg-surface px-4 py-3 shadow-card">
        <h3 className="text-[13px] font-medium text-ink">New routine</h3>
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
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
          <input
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            placeholder="Cron (optional) e.g. 0 7 * * 1-5"
            className="h-9 rounded-control border border-line bg-field px-3 font-mono text-[12.5px] text-ink outline-none focus:border-line-strong"
          />
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
      />
    </div>
  );
}
