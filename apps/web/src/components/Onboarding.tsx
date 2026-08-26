import { useState } from "react";
import { soraApi } from "../api";

type Step = "meet" | "name" | "connect" | "computer";

/** Top providers — paste any matching API key. */
const AI_OPTIONS = [
  {
    id: "openrouter",
    label: "OpenRouter",
    blurb: "One key for GPT, Claude, Gemini, Grok, and more",
    defaultModel: "openrouter:openai/gpt-4o-mini",
    keyUrl: "https://openrouter.ai/keys",
    placeholder: "sk-or-…",
  },
  {
    id: "openai",
    label: "OpenAI",
    blurb: "GPT-4o and o-series from your OpenAI account",
    defaultModel: "openai:gpt-4o-mini",
    keyUrl: "https://platform.openai.com/api-keys",
    placeholder: "sk-…",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    blurb: "Claude models from your Anthropic account",
    defaultModel: "anthropic:claude-sonnet-4-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-…",
  },
  {
    id: "google",
    label: "Gemini",
    blurb: "Gemini models from Google AI Studio",
    defaultModel: "google:gemini-2.0-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    placeholder: "AIza…",
  },
  {
    id: "xai",
    label: "Grok",
    blurb: "Grok models from your xAI account",
    defaultModel: "xai:grok-2",
    keyUrl: "https://console.x.ai",
    placeholder: "xai-…",
  },
  {
    id: "groq",
    label: "Groq",
    blurb: "Fast open models on Groq",
    defaultModel: "groq:llama-3.3-70b-versatile",
    keyUrl: "https://console.groq.com/keys",
    placeholder: "gsk_…",
  },
] as const;

export default function Onboarding({
  onDone,
}: {
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>("meet");
  const [displayName, setDisplayName] = useState("");
  const [providerId, setProviderId] =
    useState<(typeof AI_OPTIONS)[number]["id"]>("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [e2bKey, setE2bKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiOk, setAiOk] = useState(false);

  const selected = AI_OPTIONS.find((o) => o.id === providerId)!;

  async function saveName() {
    const name = displayName.trim() || "you";
    setBusy(true);
    setError(null);
    try {
      await soraApi.setConfig({ displayName: name });
      setStep("connect");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveAiAndContinue() {
    const key = apiKey.trim();
    if (!key) {
      setError("Paste your API key to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await soraApi.setProvider(providerId, { apiKey: key });
      await soraApi.setConfig({ defaultModel: selected.defaultModel });
      const result = await soraApi.testProvider(selected.defaultModel);
      if (!result.ok) {
        setError(
          result.error ??
            "That key didn’t work. Check the provider matches the key.",
        );
        return;
      }
      setAiOk(true);
      setStep("computer");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    const key = e2bKey.trim();
    if (!key) {
      setError("Your teammates need a cloud computer (E2B key).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await soraApi.setProvider("e2b", { apiKey: key });
      await soraApi.setConfig({
        computer: {
          provider: "e2b",
          preferDisplay: true,
          failClosed: true,
          idleMs: 600_000,
          commandTimeoutMs: 120_000,
        },
      });

      const existing = await soraApi.agents();
      if (existing.length === 0) {
        const created = await soraApi.createAgent({
          name: "Sora",
          description: "Your first teammate",
        });
        await soraApi.updateAgent(created.slug, {
          model: selected.defaultModel,
        });
      }

      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 py-12">
      {error && (
        <p className="rounded-control bg-red-tint px-3 py-2 text-[13px] text-red">
          {error}
        </p>
      )}

      {step === "meet" && (
        <>
          <div>
            <p className="text-[24px] font-semibold tracking-tight text-ink">
              Open-source Grok Bot
            </p>
            <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">
              AI teammates with a cloud computer. Bring your own model
              subscription — no Sora account, no Grok Bot fee.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStep("name")}
            className="self-start rounded-control bg-ink px-4 py-2 text-[13px] font-medium text-surface"
          >
            Get started
          </button>
        </>
      )}

      {step === "name" && (
        <>
          <div>
            <p className="text-[20px] font-semibold text-ink">Your name</p>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
              So your teammates know who they’re working for.
            </p>
          </div>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            autoFocus
            className="h-10 rounded-control border border-line bg-field px-3 text-[14px] text-ink outline-none focus:border-line-strong"
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveName();
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveName()}
            className="self-start rounded-control bg-ink px-4 py-2 text-[13px] font-medium text-surface disabled:opacity-50"
          >
            {busy ? "Saving…" : "Continue"}
          </button>
        </>
      )}

      {step === "connect" && (
        <>
          <div>
            <p className="text-[20px] font-semibold text-ink">Connect your AI</p>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
              Pick a provider and paste your API key. You pay that provider
              directly — Sora doesn’t bill you.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {AI_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setProviderId(opt.id);
                  setAiOk(false);
                  setError(null);
                }}
                className={`rounded-control px-2.5 py-1 text-[12px] font-medium ${
                  providerId === opt.id
                    ? "bg-ink text-surface"
                    : "bg-field text-ink-2 hover:bg-hover"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <p className="text-[12.5px] text-ink-3">{selected.blurb}</p>

          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-ink">API key</span>
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setAiOk(false);
              }}
              placeholder={selected.placeholder}
              className="h-9 rounded-control border border-line bg-field px-3 font-mono text-[12.5px] text-ink outline-none focus:border-line-strong"
            />
            <a
              href={selected.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-ink-3 underline hover:text-ink-2"
            >
              Get a key from {selected.label}
            </a>
          </label>

          <button
            type="button"
            disabled={busy || !apiKey.trim()}
            onClick={() => void saveAiAndContinue()}
            className="self-start rounded-control bg-ink px-4 py-2 text-[13px] font-medium text-surface disabled:opacity-50"
          >
            {busy ? "Testing…" : "Continue"}
          </button>
        </>
      )}

      {step === "computer" && (
        <>
          <div>
            <p className="text-[20px] font-semibold text-ink">
              Teammate computer
            </p>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
              Each teammate gets a cloud sandbox — browser, files, and a desktop
              you can watch. Same idea as Grok Bot’s computer.
            </p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-ink">E2B API key</span>
            <input
              type="password"
              autoComplete="off"
              value={e2bKey}
              onChange={(e) => setE2bKey(e.target.value)}
              placeholder="e2b_…"
              className="h-9 rounded-control border border-line bg-field px-3 font-mono text-[12.5px] text-ink outline-none focus:border-line-strong"
            />
            <a
              href="https://e2b.dev/docs/api-key"
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-ink-3 underline hover:text-ink-2"
            >
              Get a free sandbox key from E2B
            </a>
          </label>

          <button
            type="button"
            disabled={busy || !e2bKey.trim() || !aiOk}
            onClick={() => void finish()}
            className="self-start rounded-control bg-ink px-4 py-2 text-[13px] font-medium text-surface disabled:opacity-50"
          >
            {busy ? "Starting…" : "Create your first teammate"}
          </button>
        </>
      )}
    </div>
  );
}
