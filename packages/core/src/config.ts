export type SoraConfig = {
  version: number;
  defaultModel: string;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_CONFIG: Omit<SoraConfig, "createdAt" | "updatedAt"> = {
  version: 1,
  defaultModel: "mock:echo",
};

export function createDefaultConfig(now = new Date()): SoraConfig {
  const iso = now.toISOString();
  return {
    ...DEFAULT_CONFIG,
    createdAt: iso,
    updatedAt: iso,
  };
}
