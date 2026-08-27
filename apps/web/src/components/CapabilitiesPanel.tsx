import { useEffect, useState } from "react";
import { soraApi, type Agent } from "../api";

type Decision = "allow" | "ask" | "deny";

type CapabilityId =
  | "localComputer"
  | "files"
  | "terminal"
  | "browser"
  | "apps"
  | "external"
  | "automation";

type Levels = Record<CapabilityId, Decision>;

const ORDER: CapabilityId[] = [
  "localComputer",
  "files",
  "terminal",
  "browser",
  "apps",
  "external",
  "automation",
];

const META: Record<CapabilityId, string> = {
  localComputer: "Local computer",
  files: "Files",
  terminal: "Terminal",
  browser: "Browser",
  apps: "Apps",
  external: "External",
  automation: "Automation",
};

const DECISIONS: Array<{ id: Decision; label: string }> = [
  { id: "allow", label: "Allow" },
  { id: "ask", label: "Ask" },
  { id: "deny", label: "Deny" },
];

const DEFAULT_LEVELS: Levels = {
  localComputer: "ask",
  files: "ask",
  terminal: "ask",
  browser: "ask",
  apps: "ask",
  external: "ask",
  automation: "ask",
};

function levelsFromAgent(agent: Agent): Levels {
  const caps = agent.policy?.capabilities;
  if (caps) {
    return { ...DEFAULT_LEVELS, ...caps };
  }
  const actions = agent.policy?.actions ?? {};
  const one = (key: string, fallback: Decision): Decision =>
    (actions[key as keyof typeof actions] as Decision | undefined) ?? fallback;
  return {
    localComputer: (agent.policy?.localComputer as Decision) ?? "ask",
    files: one("fs.write", one("fs.read", "ask")),
    terminal: one("terminal.exec", "ask"),
    browser: one("browser.navigate", "ask"),
    apps: one("http.request", "ask"),
    external: one("agent.message", "ask"),
    automation: one("agent.delegate", "ask"),
  };
}

function policyFromLevels(levels: Levels) {
  return {
    default: "ask" as const,
    localComputer: levels.localComputer,
    capabilities: { ...levels },
    actions: {
      "fs.read": levels.files,
      "fs.write": levels.files,
      "fs.delete": levels.files,
      "terminal.exec": levels.terminal,
      "http.request": levels.apps,
      "browser.navigate": levels.browser,
      "browser.click": levels.browser,
      "browser.type": levels.browser,
      "browser.screenshot": levels.browser,
      "browser.close": levels.browser,
      "agent.message": levels.external,
      "agent.delegate": levels.automation,
    },
  };
}

type Props = {
  agentSlug: string | null;
  agentName?: string | null;
};

export default function CapabilitiesPanel({ agentSlug }: Props) {
  const [levels, setLevels] = useState<Levels | null>(null);
  const [busyId, setBusyId] = useState<CapabilityId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentSlug) {
      setLevels(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const agent = await soraApi.agent(agentSlug);
        if (!cancelled) setLevels(levelsFromAgent(agent));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLevels({ ...DEFAULT_LEVELS });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentSlug]);

  async function setLevel(id: CapabilityId, decision: Decision) {
    if (!agentSlug || !levels || busyId) return;
    if (levels[id] === decision) return;
    const prev = levels;
    const next = { ...levels, [id]: decision };
    setLevels(next);
    setBusyId(id);
    setError(null);
    try {
      const agent = await soraApi.updateAgent(agentSlug, {
        policy: policyFromLevels(next),
      });
      if (!agent.policy) {
        throw new Error(
          "Server did not save permissions. Restart the Sora app and try again.",
        );
      }
      setLevels(levelsFromAgent(agent));
    } catch (err) {
      setLevels(prev);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  if (!agentSlug) {
    return (
      <p className="text-[13px] text-ink-3">
        Pick a teammate to set capabilities.
      </p>
    );
  }

  if (!levels) {
    return <p className="text-[13px] text-ink-3">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-[12px] font-semibold tracking-[0.08em] text-ink-3">
          CAPABILITIES
        </p>
        <p className="mt-1 text-[12.5px] text-ink-3">Ask = approve each time</p>
      </div>

      <div className="flex flex-col gap-2.5">
        {ORDER.map((id) => (
          <div key={id} className="flex flex-col gap-1">
            <p className="text-[12.5px] font-medium text-ink">{META[id]}</p>
            <div className="flex overflow-hidden rounded-[8px] border border-line">
              {DECISIONS.map((opt, i) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void setLevel(id, opt.id)}
                  className={`flex-1 cursor-pointer py-1.5 text-[11px] font-medium transition-transform duration-100 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 ${
                    i > 0 ? "border-l border-line" : ""
                  } ${
                    levels[id] === opt.id ? "bg-field text-ink" : "text-ink-3"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-control bg-red-tint px-2.5 py-1.5 text-[11.5px] text-red">
          {error}
        </p>
      )}
    </div>
  );
}
