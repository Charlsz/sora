export type ParsedOpenApiOperation = {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  parameters: unknown;
};

/** Minimal OpenAPI 3 path parser — enough for tool generation. */
export function parseOpenApiOperations(
  doc: Record<string, unknown>,
): ParsedOpenApiOperation[] {
  const paths = doc.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) return [];

  const ops: ParsedOpenApiOperation[] = [];
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, raw] of Object.entries(methods ?? {})) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) {
        continue;
      }
      const op = raw as Record<string, unknown>;
      const operationId =
        String(op.operationId ?? "").trim() ||
        `${method}_${path.replace(/[^a-z0-9]+/gi, "_")}`;
      ops.push({
        operationId,
        method: method.toUpperCase(),
        path,
        summary: String(op.summary ?? op.description ?? `${method} ${path}`),
        parameters: buildParametersSchema(op),
      });
    }
  }
  return ops;
}

function buildParametersSchema(op: Record<string, unknown>): unknown {
  const props: Record<string, unknown> = {};
  const required: string[] = [];

  const params = Array.isArray(op.parameters) ? op.parameters : [];
  for (const p of params as Array<Record<string, unknown>>) {
    const name = String(p.name ?? "");
    if (!name) continue;
    const schema = (p.schema as Record<string, unknown>) ?? { type: "string" };
    props[name] = { ...schema, description: p.description };
    if (p.required) required.push(name);
    if (p.in === "path") {
      props[name] = { ...props[name], description: `(path) ${p.description ?? name}` };
    }
  }

  const body = op.requestBody as Record<string, unknown> | undefined;
  if (body) {
    props.body = {
      type: "string",
      description: "Request body (JSON string)",
    };
  }

  return {
    type: "object",
    properties: props,
    required: required.length ? required : undefined,
  };
}

export async function loadOpenApiDocument(
  specRef: string,
  home: string,
): Promise<Record<string, unknown>> {
  const trimmed = specRef.trim();
  let text: string;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const res = await fetch(trimmed);
    if (!res.ok) throw new Error(`Failed to fetch OpenAPI spec (${res.status})`);
    text = await res.text();
  } else {
    const { readFileSync } = await import("node:fs");
    const { join, isAbsolute } = await import("node:path");
    const path = isAbsolute(trimmed) ? trimmed : join(home, trimmed);
    text = readFileSync(path, "utf8");
  }
  return JSON.parse(text) as Record<string, unknown>;
}
