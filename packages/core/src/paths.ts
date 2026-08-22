import { homedir } from "node:os";
import { join } from "node:path";

/** Root directory for all local Sora state. Overridable via SORA_HOME. */
export function getSoraHome(): string {
  const override = process.env.SORA_HOME?.trim();
  if (override) return override;
  return join(homedir(), ".sora");
}

export function getPaths(home = getSoraHome()) {
  return {
    home,
    config: join(home, "config.json"),
    databaseDir: join(home, "database"),
    database: join(home, "database", "sora.sqlite"),
    agents: join(home, "agents"),
    logs: join(home, "logs"),
    agent: (slug: string) => ({
      root: join(home, "agents", slug),
      config: join(home, "agents", slug, "agent.json"),
      workspace: join(home, "agents", slug, "workspace"),
      memory: join(home, "agents", slug, "memory"),
      skills: join(home, "agents", slug, "skills"),
    }),
  } as const;
}

export type SoraPaths = ReturnType<typeof getPaths>;
