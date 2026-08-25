import { useState } from "react";
import { soraApi } from "../api";

type Step = "agent" | "model" | "plugins" | "done";

export default function Onboarding({
  onDone,
}: {
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>("agent");
  const [name, setName] = useState("klaus");
  const [description, setDescription] = useState("Personal assistant");
  const [model, setModel] = useState("mock:echo");
  const [providerId, setProviderId] = useState("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createAgent() {
    setBusy(true);
    setError(null);
    try {
      await soraApi.createAgent({
        name: name.trim() || "klaus",
        description: description.trim() || undefined,
      });
      setStep("model");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveModel() {
    setBusy(true);
    setError(null);
    try {
      if (apiKey.trim() && providerId !== "mock") {
        await soraApi.setProvider(providerId, { apiKey: apiKey.trim() });
      }
      const ref =
        providerId === "mock"
          ? "mock:echo"
          : model.includes(":")
            ? model.trim()
            : `${providerId}:${model.trim()}`;
      await soraApi.setConfig({ defaultModel: ref });
      setStep("plugins");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 py-10">
      <div>
        <p className="font-display text-3xl text-ink">Welcome to Sora</p>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          Local desktop agent workspace. Three steps and you can chat.
        </p>
      </div>

      <div className="flex gap-2 text-[12px] font-medium text-ink-3">
        {(["agent", "model", "plugins"] as const).map((s, i) => (
          <span
            key={s}
            className={step === s || (step === "done" && i < 3) ? "text-ink" : ""}
          >
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {error && (
        <p className="rounded-control bg-red-tint px-3 py-2 text-[13px] text-red">
          {error}
        </p>
      )}

      {step === "agent" && (
        <section className="flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Agent name"
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
            onClick={() => void createAgent()}
            className="self-start rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create agent"}
          </button>
        </section>
      )}

      {step === "model" && (
        <section className="flex flex-col gap-2">
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="h-9 rounded-control border border-line bg-field px-3 text-[13px] text-ink"
          >
            <option value="mock">mock (offline)</option>
            <option value="openrouter">OpenRouter</option>
            <option value="openai">OpenAI</option>
            <option value="ollama">Ollama</option>
          </select>
          {providerId !== "mock" && (
            <>
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API key (stays in ~/.sora/secrets.json)"
                className="h-9 rounded-control border border-line bg-field px-3 font-mono text-[12.5px] text-ink outline-none focus:border-line-strong"
              />
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={
                  providerId === "openrouter"
                    ? "openai/gpt-4o-mini"
                    : providerId === "ollama"
                      ? "llama3"
                      : "gpt-4o-mini"
                }
                className="h-9 rounded-control border border-line bg-field px-3 font-mono text-[12.5px] text-ink outline-none focus:border-line-strong"
              />
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveModel()}
            className="self-start rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface disabled:opacity-50"
          >
            {busy ? "Saving…" : "Continue"}
          </button>
        </section>
      )}

      {step === "plugins" && (
        <section className="flex flex-col gap-3">
          <p className="text-[13px] text-ink-2">
            Optional: link GitHub, Composio, or Bot Directory later under
            Plugins. Every agent can already search botdirectory.ai.
          </p>
          <button
            type="button"
            onClick={() => {
              setStep("done");
              onDone();
            }}
            className="self-start rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface"
          >
            Start chatting
          </button>
        </section>
      )}
    </div>
  );
}
