import type { SoraServices } from "@sora/agents";
import type { SoraEvent } from "@sora/core";
import type { PermissionAskBridge } from "./permission-ask.ts";

export type ApiServerOptions = {
  services: SoraServices;
  host?: string;
  port?: number;
  /** Serve static files from this directory (built web UI). */
  staticDir?: string;
  /** Interactive permission prompts for the workspace UI. */
  permissionAsk?: PermissionAskBridge;
};

export type StartedApiServer = {
  url: string;
  port: number;
  stop: () => void;
};

/**
 * Local HTTP + SSE API. UI and other clients talk to the runtime only through this.
 */
export function startApiServer(options: ApiServerOptions): StartedApiServer {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 7420;
  const { services, permissionAsk } = options;
  const sseClients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();

  const unsubscribe = services.runtime.events.on("*", (event) => {
    broadcast(sseClients, encoder, event);
  });

  const server = Bun.serve({
    hostname: host,
    port,
    idleTimeout: 0, // SSE stays open
    async fetch(req) {
      if (!isLocalRequest(req)) {
        return new Response("Forbidden", { status: 403 });
      }

      const url = new URL(req.url);
      const cors = corsHeaders(req);
      if (req.headers.get("origin") && Object.keys(cors).length === 0) {
        return new Response("Forbidden", { status: 403 });
      }

      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }

      try {
        if (url.pathname === "/api/health") {
          return json({ ok: true, home: services.runtime.paths.home }, cors);
        }

        if (url.pathname === "/api/events" && req.method === "GET") {
          return sseResponse(sseClients, encoder, cors);
        }

        if (url.pathname === "/api/agents" && req.method === "GET") {
          return json(services.agents.list(), cors);
        }

        if (url.pathname === "/api/agents" && req.method === "POST") {
          const body = (await req.json()) as {
            name?: string;
            description?: string;
            model?: string;
          };
          if (!body.name?.trim()) {
            return json({ error: "name is required" }, cors, 400);
          }
          const agent = services.agents.create(
            {
              name: body.name,
              description: body.description,
              model: body.model,
            },
            services.runtime.config.defaultModel,
          );
          return json(agent, cors, 201);
        }

        const runMatch = /^\/api\/agents\/([^/]+)\/run$/.exec(url.pathname);
        if (runMatch && req.method === "POST") {
          const slug = decodeURIComponent(runMatch[1]!);
          const body = (await req.json()) as {
            prompt?: string;
            skill?: string;
          };
          if (!body.prompt?.trim()) {
            return json({ error: "prompt is required" }, cors, 400);
          }
          const result = await services.runner.run({
            agent: slug,
            prompt: body.prompt,
            skill: body.skill,
          });
          return json(result, cors);
        }

        const agentMatch = /^\/api\/agents\/([^/]+)$/.exec(url.pathname);
        if (agentMatch && req.method === "GET") {
          const slug = decodeURIComponent(agentMatch[1]!);
          const agent = services.agents.requireBySlugOrName(slug);
          const workspace = services.runtime.paths.agent(agent.slug).workspace;
          return json({ ...agent, workspace }, cors);
        }

        const convMatch = /^\/api\/agents\/([^/]+)\/conversations$/.exec(
          url.pathname,
        );
        if (convMatch && req.method === "GET") {
          const slug = decodeURIComponent(convMatch[1]!);
          const agent = services.agents.requireBySlugOrName(slug);
          const conversations = await services.conversations.listForAgent(
            agent.id,
          );
          return json(conversations, cors);
        }

        const msgMatch = /^\/api\/conversations\/([^/]+)\/messages$/.exec(
          url.pathname,
        );
        if (msgMatch && req.method === "GET") {
          const id = decodeURIComponent(msgMatch[1]!);
          const messages = await services.conversations.listMessages(id);
          return json(messages, cors);
        }

        if (url.pathname === "/api/skills" && req.method === "GET") {
          return json(services.skills.list(), cors);
        }

        if (url.pathname === "/api/workflows" && req.method === "GET") {
          return json(services.workflows.list(), cors);
        }

        if (url.pathname === "/api/workflows" && req.method === "POST") {
          const body = (await req.json()) as {
            name?: string;
            description?: string;
            agent?: string;
            task?: string;
            skill?: string;
            cron?: string;
            webhook?: string;
            enabled?: boolean;
          };
          if (!body.name?.trim() || !body.agent?.trim() || !body.task?.trim()) {
            return json(
              { error: "name, agent, and task are required" },
              cors,
              400,
            );
          }
          const trigger = body.cron
            ? { type: "cron" as const, expression: body.cron }
            : body.webhook
              ? { type: "webhook" as const, path: body.webhook }
              : { type: "manual" as const };
          const wf = services.workflows.create({
            name: body.name,
            description: body.description,
            agent: body.agent,
            task: body.task,
            skill: body.skill,
            trigger,
            enabled: body.enabled ?? true,
          });
          return json(wf, cors, 201);
        }

        const wfRun = /^\/api\/workflows\/([^/]+)\/run$/.exec(url.pathname);
        if (wfRun && req.method === "POST") {
          const slug = decodeURIComponent(wfRun[1]!);
          const run = await services.workflowEngine.run(slug);
          return json(run, cors);
        }

        if (url.pathname === "/api/tools" && req.method === "GET") {
          return json(
            services.tools.list().map((t) => ({
              name: t.name,
              description: t.description,
            })),
            cors,
          );
        }

        if (url.pathname === "/api/plugins" && req.method === "GET") {
          return json(
            {
              plugins: services.plugins.statusAll(services.runtime.secrets),
            },
            cors,
          );
        }

        const pluginConnect = /^\/api\/plugins\/([^/]+)\/connect$/.exec(
          url.pathname,
        );
        if (pluginConnect && req.method === "POST") {
          const id = decodeURIComponent(pluginConnect[1]!);
          const body = (await req.json().catch(() => ({}))) as { app?: string };
          let plugin;
          try {
            plugin = services.plugins.get(id);
          } catch {
            return json({ error: `Unknown plugin "${id}"` }, cors, 404);
          }
          if (!plugin.connect) {
            return json(
              { error: "this plugin does not support connect()" },
              cors,
              400,
            );
          }
          const result = await plugin.connect(
            body.app ?? plugin.apps[0] ?? id,
            services.runtime.secrets,
          );
          return json(result, cors, result.ok ? 200 : 400);
        }

        const computerMatch = /^\/api\/agents\/([^/]+)\/computer$/.exec(
          url.pathname,
        );
        if (computerMatch && req.method === "GET") {
          const slug = decodeURIComponent(computerMatch[1]!);
          const agent = services.agents.requireBySlugOrName(slug);
          const computer = services.runner.getComputer(agent);
          return json(
            {
              agentSlug: agent.slug,
              workspaceRoot: computer.workspaceRoot,
              kind: computer.kind,
              browser: computer.browser.status(),
            },
            cors,
          );
        }

        const browserNav = /^\/api\/agents\/([^/]+)\/computer\/browser\/navigate$/.exec(
          url.pathname,
        );
        if (browserNav && req.method === "POST") {
          const slug = decodeURIComponent(browserNav[1]!);
          const agent = services.agents.requireBySlugOrName(slug);
          const body = (await req.json()) as { url?: string };
          if (!body.url?.trim()) {
            return json({ error: "url is required" }, cors, 400);
          }
          await services.permissions.assert({
            agentId: agent.id,
            agentSlug: agent.slug,
            action: "browser.navigate",
            resource: body.url,
          });
          const result = await services.runner
            .getComputer(agent)
            .browser.navigate(body.url);
          return json(result, cors, result.ok ? 200 : 400);
        }

        const browserShot = /^\/api\/agents\/([^/]+)\/computer\/browser\/screenshot$/.exec(
          url.pathname,
        );
        if (browserShot && req.method === "POST") {
          const slug = decodeURIComponent(browserShot[1]!);
          const agent = services.agents.requireBySlugOrName(slug);
          await services.permissions.assert({
            agentId: agent.id,
            agentSlug: agent.slug,
            action: "browser.screenshot",
            resource: "viewport",
          });
          const result = await services.runner
            .getComputer(agent)
            .browser.screenshot({});
          return json(result, cors, result.ok ? 200 : 400);
        }

        if (url.pathname === "/api/config" && req.method === "GET") {
          return json(
            {
              defaultModel: services.runtime.config.defaultModel,
              home: services.runtime.paths.home,
            },
            cors,
          );
        }

        if (url.pathname === "/api/config" && req.method === "PUT") {
          const body = (await req.json()) as { defaultModel?: string };
          if (!body.defaultModel?.trim()) {
            return json({ error: "defaultModel is required" }, cors, 400);
          }
          const ref = body.defaultModel.trim();
          try {
            services.providers.resolve(ref);
          } catch (error) {
            return json(
              {
                error:
                  error instanceof Error ? error.message : "unknown provider",
              },
              cors,
              400,
            );
          }
          const config = services.runtime.updateConfig({ defaultModel: ref });
          return json({ defaultModel: config.defaultModel }, cors);
        }

        if (url.pathname === "/api/providers" && req.method === "GET") {
          return json(
            {
              providers: services.providers.status(services.runtime.secrets),
              defaultModel: services.runtime.config.defaultModel,
            },
            cors,
          );
        }

        const providerMatch = /^\/api\/providers\/([^/]+)$/.exec(url.pathname);
        if (providerMatch && req.method === "PUT") {
          const id = decodeURIComponent(providerMatch[1]!);
          if (id === "mock") {
            return json({ error: "mock provider needs no credentials" }, cors, 400);
          }
          const body = (await req.json()) as {
            apiKey?: string;
            baseUrl?: string;
          };
          services.runtime.setProviderCredential(id, {
            apiKey: body.apiKey,
            baseUrl: body.baseUrl,
          });
          services.reloadProviders();
          return json(
            {
              ok: true,
              providers: services.providers.status(services.runtime.secrets),
            },
            cors,
          );
        }

        if (providerMatch && req.method === "DELETE") {
          const id = decodeURIComponent(providerMatch[1]!);
          services.runtime.clearProviderCredential(id);
          services.reloadProviders();
          return json(
            {
              ok: true,
              providers: services.providers.status(services.runtime.secrets),
            },
            cors,
          );
        }

        if (url.pathname === "/api/providers/test" && req.method === "POST") {
          const body = (await req.json()) as { model?: string };
          const model =
            body.model?.trim() || services.runtime.config.defaultModel;
          try {
            const { provider, model: modelId } =
              services.providers.resolve(model);
            const response = await provider.chat({
              model: modelId,
              messages: [
                {
                  role: "user",
                  content: "Reply with exactly: sora-ok",
                },
              ],
              maxTokens: 32,
            });
            return json(
              {
                ok: true,
                model,
                reply: response.message.content ?? "",
              },
              cors,
            );
          } catch (error) {
            return json(
              {
                ok: false,
                model,
                error: error instanceof Error ? error.message : String(error),
              },
              cors,
              400,
            );
          }
        }

        if (url.pathname === "/api/permissions/pending" && req.method === "GET") {
          return json(permissionAsk?.list() ?? [], cors);
        }

        if (url.pathname === "/api/permissions/respond" && req.method === "POST") {
          if (!permissionAsk) {
            return json(
              { error: "interactive permissions are not enabled (start without --yes)" },
              cors,
              400,
            );
          }
          const body = (await req.json()) as {
            requestId?: string;
            decision?: string;
          };
          if (!body.requestId?.trim()) {
            return json({ error: "requestId is required" }, cors, 400);
          }
          if (body.decision !== "allow" && body.decision !== "deny") {
            return json({ error: "decision must be allow or deny" }, cors, 400);
          }
          const ok = permissionAsk.respond(body.requestId, body.decision);
          if (!ok) {
            return json({ error: "unknown or expired permission request" }, cors, 404);
          }
          return json({ ok: true, requestId: body.requestId, decision: body.decision }, cors);
        }

        // Static UI
        if (options.staticDir && req.method === "GET") {
          const fileRes = await serveStatic(options.staticDir, url.pathname);
          if (fileRes) {
            for (const [k, v] of Object.entries(cors)) {
              fileRes.headers.set(k, v);
            }
            return fileRes;
          }
        }

        return json({ error: "not found" }, cors, 404);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return json({ error: message }, cors, 500);
      }
    },
  });

  const url = `http://${host}:${server.port}`;

  return {
    url,
    port: server.port,
    stop() {
      unsubscribe();
      for (const client of sseClients) {
        try {
          client.close();
        } catch {
          // ignore
        }
      }
      sseClients.clear();
      server.stop(true);
      services.workflowEngine.stopScheduler();
      void services.runner.dispose();
      services.runtime.close();
    },
  };
}

function isLocalHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.trim().toLowerCase();
  return (
    host.startsWith("127.0.0.1") ||
    host.startsWith("localhost") ||
    host.startsWith("[::1]")
  );
}

function isLocalOrigin(origin: string | null): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (url.protocol === "tauri:" || url.protocol === "asset:") return true;
    const host = url.hostname.toLowerCase();
    return (
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "::1" ||
      host === "tauri.localhost"
    );
  } catch {
    return false;
  }
}

function isLocalRequest(req: Request): boolean {
  return isLocalHost(req.headers.get("host"));
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (origin && !isLocalOrigin(origin)) {
    return {};
  }
  const allow = origin ?? "http://127.0.0.1";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-allow-credentials": "true",
    vary: "Origin",
  };
}

function json(
  data: unknown,
  cors: Record<string, string>,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function sseResponse(
  clients: Set<ReadableStreamDefaultController<Uint8Array>>,
  encoder: TextEncoder,
  cors: Record<string, string>,
): Response {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      clients.add(c);
      c.enqueue(encoder.encode(`event: ready\ndata: {"ok":true}\n\n`));
    },
    cancel() {
      clients.delete(controller);
    },
  });

  return new Response(stream, {
    headers: {
      ...cors,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}

function broadcast(
  clients: Set<ReadableStreamDefaultController<Uint8Array>>,
  encoder: TextEncoder,
  event: SoraEvent,
): void {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  const bytes = encoder.encode(payload);
  for (const client of [...clients]) {
    try {
      client.enqueue(bytes);
    } catch {
      clients.delete(client);
    }
  }
}

async function serveStatic(
  root: string,
  pathname: string,
): Promise<Response | null> {
  const path = pathname === "/" ? "/index.html" : pathname;
  const file = Bun.file(`${root}${path}`);
  if (await file.exists()) {
    return new Response(file);
  }
  // SPA fallback
  const index = Bun.file(`${root}/index.html`);
  if (await index.exists()) {
    return new Response(index);
  }
  return null;
}
