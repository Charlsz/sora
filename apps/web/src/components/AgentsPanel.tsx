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
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [editModel, setEditModel] = useState("");

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

  function startEdit(agent: Agent) {
    setEditing(agent.slug);
    setEditName(agent.name);
    setEditDescription(agent.description);
    setEditInstructions(agent.instructions);
    setEditModel(agent.model);
  }

  async function saveEdit(slug: string) {
    setBusy(true);
    try {
      await soraApi.updateAgent(slug, {
        name: editName.trim() || undefined,
        description: editDescription,
        instructions: editInstructions,
        model: editModel.trim() || undefined,
      });
      setEditing(null);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(slug: string) {
    if (!window.confirm(`Delete agent "${slug}"? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      await soraApi.deleteAgent(slug);
      if (editing === slug) setEditing(null);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Teammates</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          Create a teammate, then give them tasks from their chat. Default model:{" "}
          {defaultModel}
        </p>
      </div>

      <section className="rounded-card bg-surface px-4 py-3 shadow-card">
        <h3 className="text-[13px] font-medium text-ink">New teammate</h3>
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
            {busy ? "Creating…" : "Create teammate"}
          </button>
        </div>
      </section>

      <div className="flex flex-col gap-2">
        {agents.map((a) => (
          <div
            key={a.id}
            className="rounded-card bg-surface px-4 py-3 shadow-card"
          >
            {editing === a.slug ? (
              <div className="flex flex-col gap-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-9 rounded-control border border-line bg-field px-3 text-[13px] text-ink outline-none"
                />
                <input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Description"
                  className="h-9 rounded-control border border-line bg-field px-3 text-[13px] text-ink outline-none"
                />
                <input
                  value={editModel}
                  onChange={(e) => setEditModel(e.target.value)}
                  placeholder="Model (provider:model)"
                  className="h-9 rounded-control border border-line bg-field px-3 font-mono text-[12px] text-ink outline-none"
                />
                <textarea
                  value={editInstructions}
                  onChange={(e) => setEditInstructions(e.target.value)}
                  rows={4}
                  placeholder="System instructions"
                  className="rounded-control border border-line bg-field px-3 py-2 text-[12px] text-ink outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveEdit(a.slug)}
                    className="rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="rounded-control bg-field px-3 py-1.5 text-[12.5px] text-ink-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onSelect(a.slug)}
                  className="w-full text-left"
                >
                  <div className="text-[14px] font-medium text-ink">
                    {a.name}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-ink-2">
                    {a.description || a.model}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-ink-3">
                    {a.slug} · {a.model}
                  </div>
                </button>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => startEdit(a)}
                    className="rounded-control bg-field px-2.5 py-1 text-[12px] text-ink-2 hover:bg-hover"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(a.slug)}
                    className="rounded-control bg-red-tint px-2.5 py-1 text-[12px] text-red"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
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
