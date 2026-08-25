import { useState } from "react";
import { soraApi, type Agent } from "../api";

export default function AgentsPanel({
  agents,
  defaultModel,
  onSelect,
  onChanged,
  onError,
}: {
  agents: Agent[];
  defaultModel: string;
  onSelect: (slug: string) => void;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) {
      onError("Agent name is required");
      return;
    }
    setBusy(true);
    try {
      const agent = await soraApi.createAgent({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setName("");
      setDescription("");
      onChanged();
      onSelect(agent.slug);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Agents</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          Each agent gets its own workspace, browser profile, and memory.
          Default model: {defaultModel}
        </p>
      </div>

      <section className="rounded-card bg-surface px-4 py-3 shadow-card">
        <h3 className="text-[13px] font-medium text-ink">Create agent</h3>
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. klaus)"
            className="h-9 rounded-control border border-line bg-field px-3 text-[13px] text-ink outline-none focus:border-line-strong"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description"
            className="h-9 rounded-control border border-line bg-field px-3 text-[13px] text-ink outline-none focus:border-line-strong"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void create()}
            className="self-start rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </section>

      <div className="flex flex-col gap-2">
        {agents.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a.slug)}
            className="rounded-card bg-surface px-4 py-3 text-left shadow-card transition-colors hover:bg-hover"
          >
            <div className="text-[14px] font-medium text-ink">{a.name}</div>
            <div className="mt-0.5 text-[12.5px] text-ink-2">
              {a.description || a.model}
            </div>
          </button>
        ))}
        {agents.length === 0 && (
          <p className="text-[13px] text-ink-3">
            No agents yet — create one to start chatting.
          </p>
        )}
      </div>
    </div>
  );
}
