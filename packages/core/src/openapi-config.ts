import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type OpenApiSpecConfig = {
  id: string;
  name: string;
  /** OpenAPI 3 JSON URL or file path under ~/.sora */
  spec: string;
  baseUrl?: string;
  enabled?: boolean;
};

export type OpenApiConfigFile = {
  version: 1;
  specs: OpenApiSpecConfig[];
  updatedAt: string;
};

export const EMPTY_OPENAPI_CONFIG = (): OpenApiConfigFile => ({
  version: 1,
  specs: [],
  updatedAt: new Date().toISOString(),
});

export function loadOpenApiConfig(path: string): OpenApiConfigFile {
  if (!existsSync(path)) return EMPTY_OPENAPI_CONFIG();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as OpenApiConfigFile;
    return {
      version: 1,
      specs: Array.isArray(raw.specs) ? raw.specs : [],
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return EMPTY_OPENAPI_CONFIG();
  }
}

export function saveOpenApiConfig(path: string, config: OpenApiConfigFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        version: 1,
        specs: config.specs,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
}

export function publicOpenApiSpecs(config: OpenApiConfigFile) {
  return config.specs.map((s) => ({
    id: s.id,
    name: s.name,
    spec: s.spec,
    baseUrl: s.baseUrl,
    enabled: s.enabled !== false,
  }));
}
