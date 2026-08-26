import { useState } from "react";
import { soraApi } from "../api";
import CreateTeammateForm from "./CreateTeammateForm";

type Step = "meet" | "name" | "keys" | "teammate";

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
    blurb: "GPT models from your OpenAI account",
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
    blurb: "Gemini from Google AI Studio",
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

const STEPS: Step[] = ["meet", "name", "keys", "teammate"];

export default function Onboarding({
  onDone,
}: {
  onDone: (opts?: {
    agentSlug?: string;
    setupPrompt?: string;
  }) => void;
}) {
  const [step, setStep] = useState<Step>("meet");
  const [displayName, setDisplayName] = useState("");
  const [providerId, setProviderId] =
    useState<(typeof AI_OPTIONS)[number]["id"]>("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [e2bKey, setE2bKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = AI_OPTIONS.find((o) => o.id === providerId)!;
  const stepIndex = STEPS.indexOf(step);

  async function saveName() {
    const name = displayName.trim() || "you";
    setBusy(true);
    setError(null);
    try {
      await soraApi.setConfig({ displayName: name });
      setStep("keys");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  /** Save both keys; silently verify the model key before continuing. */
  async function saveKeysAndContinue() {
    const modelKey = apiKey.trim();
    const sandboxKey = e2bKey.trim();
    if (!modelKey) {
      setError("Paste your AI API key to continue.");
      return;
    }
    if (!sandboxKey) {
      setError("Paste your E2B key so teammates get a computer.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await soraApi.setProvider(providerId, { apiKey: modelKey });
      await soraApi.setConfig({ defaultModel: selected.defaultModel });
      await soraApi.setProvider("e2b", { apiKey: sandboxKey });
      await soraApi.setConfig({
        computer: {
          provider: "e2b",
          preferDisplay: true,
          failClosed: true,
          idleMs: 600_000,
          commandTimeoutMs: 120_000,
        },
      });

      const result = await soraApi.testProvider(selected.defaultModel);
      if (!result.ok) {
        setError(
          result.error ??
            "That AI key didn’t work. Check the provider matches the key.",
        );
        return;
      }

      setApiKey("");
      setE2bKey("");
      setStep("teammate");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-panel">
      <div className="flex shrink-0 items-center justify-between px-8 py-5">
        <p className="text-[22px] font-semibold tracking-tight text-ink">Sora</p>
        {step !== "meet" && (
          <p className="text-[12px] text-ink-3">
            Step {Math.max(1, stepIndex)} of {STEPS.length - 1}
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 pb-16">
        <div
          className={`w-full ${step === "teammate" ? "max-w-lg" : "max-w-md"}`}
        >
          {error && (
            <p className="mb-5 rounded-control bg-red-tint px-3 py-2 text-[13px] text-red">
              {error}
            </p>
          )}

          {step === "meet" && (
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-[28px] font-semibold tracking-tight text-ink">
                  Your team of AI teammates
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
                  Sora is the app. You create teammates, each with a name, a
                  chat, and a computer. Bring your own model key and sandbox.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep("name")}
                className="self-start rounded-control bg-ink px-5 py-2.5 text-[14px] font-medium text-surface"
              >
                Get started
              </button>
            </div>
          )}

          {step === "name" && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[24px] font-semibold text-ink">Your name</p>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
                  So your teammates know who they’re working for.
                </p>
              </div>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                autoFocus
                className="h-11 rounded-control border border-line bg-field px-3 text-[15px] text-ink outline-none focus:border-line-strong"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveName();
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveName()}
                className="self-start rounded-control bg-ink px-5 py-2.5 text-[14px] font-medium text-surface disabled:opacity-50"
              >
                {busy ? "Saving…" : "Continue"}
              </button>
            </div>
          )}

          {step === "keys" && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[24px] font-semibold text-ink">
                  Connect what you need
                </p>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
                  Keys stay on this computer (encrypted). You pay those
                  providers directly; nothing is billed through Sora.
                </p>
              </div>

              <div>
                <p className="mb-1.5 text-[13px] font-medium text-ink">
                  AI provider
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {AI_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setProviderId(opt.id);
                        setError(null);
                      }}
                      className={`rounded-control px-2.5 py-1.5 text-[12.5px] font-medium ${
                        providerId === opt.id
                          ? "bg-ink text-surface"
                          : "bg-field text-ink-2 hover:bg-hover"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[12.5px] text-ink-3">{selected.blurb}</p>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-ink">
                  {selected.label} API key
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={selected.placeholder}
                  className="h-11 rounded-control border border-line bg-field px-3 font-mono text-[13px] text-ink outline-none focus:border-line-strong"
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

              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-ink">
                  E2B sandbox key
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={e2bKey}
                  onChange={(e) => setE2bKey(e.target.value)}
                  placeholder="e2b_…"
                  className="h-11 rounded-control border border-line bg-field px-3 font-mono text-[13px] text-ink outline-none focus:border-line-strong"
                />
                <a
                  href="https://e2b.dev/docs/api-key"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] text-ink-3 underline hover:text-ink-2"
                >
                  Get a free key from E2B
                </a>
              </label>

              <button
                type="button"
                disabled={busy || !apiKey.trim() || !e2bKey.trim()}
                onClick={() => void saveKeysAndContinue()}
                className="self-start rounded-control bg-ink px-5 py-2.5 text-[14px] font-medium text-surface disabled:opacity-50"
              >
                {busy ? "Connecting…" : "Continue"}
              </button>
            </div>
          )}

          {step === "teammate" && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[24px] font-semibold text-ink">
                  Create your first teammate
                </p>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
                  Name your teammate and paste a setup prompt. You can also
                  search Bot Directory below to copy one in.
                </p>
              </div>

              <CreateTeammateForm
                defaultModel={selected.defaultModel}
                compact
                onReady={async (agent, meta) => {
                  onDone({
                    agentSlug: agent.slug,
                    setupPrompt: meta.setupPrompt,
                  });
                }}
                onError={setError}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
