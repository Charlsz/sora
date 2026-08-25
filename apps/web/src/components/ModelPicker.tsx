import { useMemo } from "react";
import type { ModelOption, ProviderInfo } from "../api";

export default function ModelPicker({
  providers,
  models,
  value,
  onChange,
  disabled,
}: {
  providers: ProviderInfo[];
  models: Record<string, ModelOption[]>;
  value: string;
  onChange: (modelRef: string) => void;
  disabled?: boolean;
}) {
  const parsed = useMemo(() => {
    const idx = value.indexOf(":");
    if (idx <= 0) return { provider: "", model: value };
    return {
      provider: value.slice(0, idx),
      model: value.slice(idx + 1),
    };
  }, [value]);

  const configuredProviders = useMemo(
    () => providers.filter((p) => p.configured),
    [providers],
  );

  const providerModels = models[parsed.provider] ?? [];

  function selectProvider(providerId: string) {
    const list = models[providerId] ?? [];
    const first = list[0];
    if (first) {
      onChange(`${providerId}:${first.id}`);
    } else {
      onChange(`${providerId}:`);
    }
  }

  function selectModel(modelId: string) {
    if (!parsed.provider) return;
    onChange(`${parsed.provider}:${modelId}`);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <select
          value={parsed.provider}
          disabled={disabled}
          onChange={(e) => selectProvider(e.target.value)}
          className="min-w-0 flex-1 rounded-control border border-line bg-field px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-line-strong disabled:opacity-50"
        >
          <option value="">Provider…</option>
          {configuredProviders.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {parsed.provider && providerModels.length > 0 && (
          <select
            value={providerModels.some((m) => m.id === parsed.model) ? parsed.model : ""}
            disabled={disabled}
            onChange={(e) => selectModel(e.target.value)}
            className="min-w-0 flex-1 rounded-control border border-line bg-field px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-line-strong disabled:opacity-50"
          >
            <option value="">Pick a model…</option>
            {providerModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.description ? ` — ${m.description}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="provider:model-id"
        className="w-full rounded-control border border-line bg-field px-2.5 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-line-strong disabled:opacity-50"
      />
      {configuredProviders.length === 0 && (
        <p className="text-[11.5px] text-ink-3">
          Connect a provider below, then pick a model here.
        </p>
      )}
    </div>
  );
}
