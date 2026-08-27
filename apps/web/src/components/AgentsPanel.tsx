import { useState } from "react";
import { soraApi, type Agent } from "../api";
import CreateTeammateForm from "./CreateTeammateForm";
import { isReservedTeammateName } from "../teammateNames";
import BotMark, {
  BOT_ACCENT_PRESETS,
  normalizeAccentColor,
} from "./BotMark";
import { teammateColor } from "./SidebarNav";

export default function AgentsPanel({
  agents,
  defaultModel,
  onSelect,
  onChanged,
  onError,
  onSetupFromDirectory,
}: {
  agents: Agent[];
  defaultModel: string;
  onSelect: (slug: string) => void;
  onChanged: () => void;
  onError: (message: string) => void;
  /** Open chat and run the setup prompt as the first message. */
  onSetupFromDirectory?: (
    agent: Agent,
    setupPrompt: string,
  ) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editAccent, setEditAccent] = useState(BOT_ACCENT_PRESETS[0]!);

  function startEdit(agent: Agent) {
    setEditing(agent.slug);
    setEditName(agent.name);
    setEditDescription(agent.description);
    setEditInstructions(agent.instructions);
    setEditModel(agent.model);
    setEditAccent(
      normalizeAccentColor(agent.accentColor, teammateColor(agent.slug)),
    );
  }

  async function saveEdit(slug: string) {
    if (editName.trim() && isReservedTeammateName(editName)) {
      onError("That name is reserved for the app. Pick a teammate name.");
      return;
    }
    setBusy(true);
    try {
      await soraApi.updateAgent(slug, {
        name: editName.trim() || undefined,
        description: editDescription,
        instructions: editInstructions,
        model: editModel.trim() || undefined,
        accentColor: normalizeAccentColor(editAccent, BOT_ACCENT_PRESETS[0]!),
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
    if (!window.confirm(`Delete teammate "${slug}"? This cannot be undone.`)) {
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
          Each teammate has a chat, a computer, and a model. Default:{" "}
          {defaultModel}
        </p>
      </div>

      <section className="rounded-card bg-surface px-4 py-3 shadow-card">
        <CreateTeammateForm
          existingNames={agents.map((a) => a.name)}
          compact
          onReady={async (agent, meta) => {
            onChanged();
            if (onSetupFromDirectory) {
              await onSetupFromDirectory(agent, meta.setupPrompt);
            } else {
              onSelect(agent.slug);
            }
          }}
          onError={onError}
        />
      </section>

      <ul className="flex flex-col gap-2">
        {agents.map((agent) => {
          const markColor =
            agent.accentColor?.trim() || teammateColor(agent.slug);
          return (
            <li
              key={agent.id}
              className="rounded-card bg-surface px-4 py-3 shadow-card"
            >
              {editing === agent.slug ? (
                <div className="flex flex-col gap-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-9 rounded-control border border-line bg-field px-3 text-[13px] text-ink outline-none focus:border-line-strong"
                  />
                  <input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Role"
                    className="h-9 rounded-control border border-line bg-field px-3 text-[13px] text-ink outline-none focus:border-line-strong"
                  />
                  <textarea
                    value={editInstructions}
                    onChange={(e) => setEditInstructions(e.target.value)}
                    rows={3}
                    className="rounded-control border border-line bg-field px-3 py-2 text-[13px] text-ink outline-none focus:border-line-strong"
                  />
                  <input
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                    placeholder="Model"
                    className="h-9 rounded-control border border-line bg-field px-3 font-mono text-[12px] text-ink outline-none focus:border-line-strong"
                  />
                  <div className="flex items-center gap-2">
                    <BotMark color={editAccent} size={28} />
                    <div className="flex flex-wrap gap-1">
                      {BOT_ACCENT_PRESETS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={`Color ${c}`}
                          onClick={() => setEditAccent(c)}
                          className={`size-5 rounded-[5px] border ${
                            editAccent.toUpperCase() === c
                              ? "border-ink"
                              : "border-line"
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveEdit(agent.slug)}
                      className="rounded-control bg-ink px-3 py-1.5 text-[12px] font-medium text-surface disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="rounded-control bg-field px-3 py-1.5 text-[12px] font-medium text-ink-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onSelect(agent.slug)}
                    className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                  >
                    <BotMark color={markColor} size={28} className="mt-0.5" />
                    <span className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">
                        {agent.name}
                      </p>
                      <p className="mt-0.5 truncate text-[12.5px] text-ink-3">
                        {agent.description || agent.model}
                      </p>
                    </span>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(agent)}
                      className="rounded-control bg-field px-2 py-1 text-[11px] font-medium text-ink-2 hover:bg-hover"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(agent.slug)}
                      className="rounded-control bg-field px-2 py-1 text-[11px] font-medium text-red hover:bg-hover disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
