import type { SoraServices } from "@sora/agents";
import {
  loadMcpConfig,
  loadOpenApiConfig,
  publicMcpServers,
  publicOpenApiSpecs,
  saveMcpConfig,
  saveOpenApiConfig,
  type McpServerConfig,
  type OpenApiSpecConfig,
  type SoraEvent,
} from "@sora/core";
import {
  BOTDIRECTORY_CATEGORIES,
  BOTDIRECTORY_SITE,
  listBots,
  loadCatalog,
  mirrorFullFeed,
  publishBot,
  searchLocal,
  signup as botdirectorySignup,
  subscribeNewsletter,
  syncCatalog,
  whoAmI,
  type BotdirectoryBot,
} from "@sora/plugins";
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
          try {
            const agent = services.agents.create(
              {
                name: body.name,
                description: body.description,
                model: body.model,
              },
              services.runtime.config.defaultModel,
            );
            return json(agent, cors, 201);
          } catch (err) {
            return json(
              { error: err instanceof Error ? err.message : String(err) },
              cors,
              400,
            );
          }
        }

        const runMatch = /^\/api\/agents\/([^/]+)\/run$/.exec(url.pathname);
        if (runMatch && req.method === "POST") {
          const slug = decodeURIComponent(runMatch[1]!);
          const body = (await req.json()) as {
            prompt?: string;
            skill?: string;
            conversationId?: string;
          };
          if (!body.prompt?.trim()) {
            return json({ error: "prompt is required" }, cors, 400);
          }
          const result = await services.runner.run({
            agent: slug,
            prompt: body.prompt,
            skill: body.skill,
            conversationId: body.conversationId,
          });
          return json(result, cors);
        }

        const agentMatch = /^\/api\/agents\/([^/]+)$/.exec(url.pathname);
        if (agentMatch && req.method === "PATCH") {
          const slug = decodeURIComponent(agentMatch[1]!);
          const body = (await req.json()) as {
            name?: string;
            description?: string;
            instructions?: string;
            model?: string;
          };
          if (body.model?.trim()) {
            try {
              services.providers.resolve(body.model.trim());
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
          }
          try {
            const agent = services.agents.update(slug, {
              name: body.name,
              description: body.description,
              instructions: body.instructions,
              model: body.model?.trim(),
            });
            return json(agent, cors);
          } catch (err) {
            return json(
              { error: err instanceof Error ? err.message : String(err) },
              cors,
              400,
            );
          }
        }

        if (agentMatch && req.method === "DELETE") {
          const slug = decodeURIComponent(agentMatch[1]!);
          services.agents.delete(slug);
          return json({ ok: true, slug }, cors);
        }
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

        if (url.pathname === "/api/workflows/record" && req.method === "POST") {
          const body = (await req.json()) as {
            conversationId?: string;
            name?: string;
            description?: string;
            agent?: string;
            cron?: string;
            webhook?: string;
          };
          if (!body.conversationId?.trim() || !body.name?.trim()) {
            return json(
              { error: "conversationId and name are required" },
              cors,
              400,
            );
          }
          const { stepsFromConversation } = await import("@sora/workflows");
          const messages = await services.conversations.listMessages(
            body.conversationId,
          );
          const steps = stepsFromConversation(messages);
          if (!steps.length) {
            return json(
              { error: "No tool steps found in this conversation" },
              cors,
              400,
            );
          }
          const conversation = await services.conversations.get(
            body.conversationId,
          );
          if (!conversation) {
            return json({ error: "Conversation not found" }, cors, 404);
          }
          const agentRow = services.agents.getById(conversation.agentId);
          const agentSlug = body.agent?.trim() || agentRow?.slug;
          if (!agentSlug) {
            return json({ error: "agent is required" }, cors, 400);
          }
          const trigger = body.cron
            ? { type: "cron" as const, expression: body.cron }
            : body.webhook
              ? { type: "webhook" as const, path: body.webhook }
              : { type: "manual" as const };
          const wf = services.workflows.create({
            name: body.name,
            description:
              body.description ??
              `Recorded from conversation (${steps.length} steps)`,
            agent: agentSlug,
            task: `Replay ${steps.length} demonstrated tool step(s)`,
            trigger,
            steps,
            source: "demonstration",
          });
          return json({ ok: true, workflow: wf, steps: steps.length }, cors, 201);
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
            steps?: Array<{ tool: string; arguments: Record<string, unknown> }>;
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
            steps: body.steps,
          });
          return json(wf, cors, 201);
        }

        const wfRun = /^\/api\/workflows\/([^/]+)\/run$/.exec(url.pathname);
        if (wfRun && req.method === "POST") {
          const slug = decodeURIComponent(wfRun[1]!);
          const run = await services.workflowEngine.run(slug);
          return json(run, cors);
        }

        const wfRuns = /^\/api\/workflows\/([^/]+)\/runs$/.exec(url.pathname);
        if (wfRuns && req.method === "GET") {
          const slug = decodeURIComponent(wfRuns[1]!);
          const wf = services.workflows.requireBySlug(slug);
          const limit = Math.min(
            50,
            Math.max(1, Number(url.searchParams.get("limit") ?? "20") || 20),
          );
          return json(services.workflows.listRuns(wf.id, limit), cors);
        }

        const wfMatch = /^\/api\/workflows\/([^/]+)$/.exec(url.pathname);
        if (wfMatch && req.method === "PATCH") {
          const slug = decodeURIComponent(wfMatch[1]!);
          const body = (await req.json()) as { enabled?: boolean };
          if (typeof body.enabled !== "boolean") {
            return json({ error: "enabled boolean is required" }, cors, 400);
          }
          const wf = services.workflows.setEnabled(slug, body.enabled);
          return json(wf, cors);
        }

        if (wfMatch && req.method === "DELETE") {
          const slug = decodeURIComponent(wfMatch[1]!);
          services.workflows.remove(slug);
          return json({ ok: true, slug }, cors);
        }

        const hookMatch = /^\/api\/hooks\/(.+)$/.exec(url.pathname);
        if (hookMatch && req.method === "POST") {
          const path = decodeURIComponent(hookMatch[1]!);
          const secret = req.headers.get("x-sora-webhook-secret") ?? undefined;
          let body: Record<string, unknown> = {};
          try {
            const raw = await req.text();
            body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          } catch {
            body = {};
          }
          const runs = await services.workflowEngine.handleWebhook({
            path,
            secret,
            body,
          });
          return json(
            {
              ok: true,
              triggered: runs.length,
              runs: runs.map((r) => ({
                id: r.id,
                status: r.status,
                workflowId: r.workflowId,
              })),
            },
            cors,
          );
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

        if (url.pathname === "/api/mcp" && req.method === "GET") {
          const cfg = loadMcpConfig(services.runtime.paths.mcp);
          return json({ servers: publicMcpServers(cfg) }, cors);
        }

        if (url.pathname === "/api/mcp" && req.method === "PUT") {
          const body = (await req.json()) as {
            servers?: McpServerConfig[];
          };
          if (!Array.isArray(body.servers)) {
            return json({ error: "servers array required" }, cors, 400);
          }
          const sanitized = body.servers
            .map(normalizeMcpServer)
            .filter((s): s is McpServerConfig => s !== null);
          saveMcpConfig(services.runtime.paths.mcp, {
            version: 1,
            servers: sanitized,
            updatedAt: new Date().toISOString(),
          });
          await services.reloadPlugins();
          const cfg = loadMcpConfig(services.runtime.paths.mcp);
          return json(
            {
              ok: true,
              servers: publicMcpServers(cfg),
              tools: services.plugins
                .get("mcp")
                .tools(services.runtime.secrets)
                .map((t) => t.name),
            },
            cors,
          );
        }

        if (url.pathname === "/api/mcp/servers" && req.method === "POST") {
          const body = (await req.json()) as Partial<McpServerConfig>;
          const server = normalizeMcpServer(body);
          if (!server) {
            return json(
              {
                error:
                  "id, name, and transport required (stdio needs command; http needs url)",
              },
              cors,
              400,
            );
          }
          const cfg = loadMcpConfig(services.runtime.paths.mcp);
          const idx = cfg.servers.findIndex((s) => s.id === server.id);
          if (idx >= 0) {
            const prev = cfg.servers[idx]!;
            cfg.servers[idx] = {
              ...server,
              headers: server.headers ?? prev.headers,
              env: server.env ?? prev.env,
            };
          } else {
            cfg.servers.push(server);
          }
          saveMcpConfig(services.runtime.paths.mcp, cfg);
          await services.reloadPlugins();
          return json(
            {
              ok: true,
              servers: publicMcpServers(
                loadMcpConfig(services.runtime.paths.mcp),
              ),
            },
            cors,
          );
        }

        const mcpDelete = /^\/api\/mcp\/servers\/([^/]+)$/.exec(url.pathname);
        if (mcpDelete && req.method === "DELETE") {
          const id = decodeURIComponent(mcpDelete[1]!);
          const cfg = loadMcpConfig(services.runtime.paths.mcp);
          cfg.servers = cfg.servers.filter((s) => s.id !== id);
          saveMcpConfig(services.runtime.paths.mcp, cfg);
          await services.reloadPlugins();
          return json(
            {
              ok: true,
              servers: publicMcpServers(
                loadMcpConfig(services.runtime.paths.mcp),
              ),
            },
            cors,
          );
        }

        if (url.pathname === "/api/mcp/reload" && req.method === "POST") {
          await services.reloadPlugins();
          const mcp = services.plugins.get("mcp");
          return json(
            {
              ok: true,
              tools: mcp.tools(services.runtime.secrets).map((t) => ({
                name: t.name,
                description: t.description,
              })),
              servers: publicMcpServers(
                loadMcpConfig(services.runtime.paths.mcp),
              ),
            },
            cors,
          );
        }

        if (url.pathname === "/api/openapi" && req.method === "GET") {
          const cfg = loadOpenApiConfig(services.runtime.paths.openapi);
          return json({ specs: publicOpenApiSpecs(cfg) }, cors);
        }

        if (url.pathname === "/api/openapi" && req.method === "PUT") {
          const body = (await req.json()) as { specs?: OpenApiSpecConfig[] };
          if (!Array.isArray(body.specs)) {
            return json({ error: "specs array required" }, cors, 400);
          }
          saveOpenApiConfig(services.runtime.paths.openapi, {
            version: 1,
            specs: body.specs,
            updatedAt: new Date().toISOString(),
          });
          await services.reloadPlugins();
          return json(
            {
              ok: true,
              specs: publicOpenApiSpecs(
                loadOpenApiConfig(services.runtime.paths.openapi),
              ),
            },
            cors,
          );
        }

        if (url.pathname === "/api/openapi/reload" && req.method === "POST") {
          await services.reloadPlugins();
          const openapi = services.plugins.get("openapi");
          return json(
            {
              ok: true,
              tools: openapi.tools(services.runtime.secrets).map((t) => t.name),
            },
            cors,
          );
        }

        if (url.pathname === "/api/botdirectory" && req.method === "GET") {
          const catalog = loadCatalog(
            services.runtime.paths.botdirectoryCatalog,
          );
          const cred = services.runtime.secrets.providers.botdirectory;
          return json(
            {
              site: BOTDIRECTORY_SITE,
              categories: BOTDIRECTORY_CATEGORIES,
              username: cred?.username ?? null,
              writeConfigured: Boolean(cred?.apiKey?.trim()),
              catalog: {
                total: Object.keys(catalog.bots).length,
                updatedAt: catalog.updatedAt,
                complete: catalog.complete,
                nextCursor: catalog.nextCursor,
              },
            },
            cors,
          );
        }

        if (url.pathname === "/api/botdirectory/bots" && req.method === "GET") {
          const q = url.searchParams.get("q") ?? undefined;
          const category = url.searchParams.get("category") ?? undefined;
          const integration = url.searchParams.get("integration") ?? undefined;
          const limit = Number(url.searchParams.get("limit") ?? "25");
          const live = url.searchParams.get("live") === "1";
          const catalog = loadCatalog(
            services.runtime.paths.botdirectoryCatalog,
          );
          let bots: BotdirectoryBot[] = searchLocal(catalog, {
            q,
            category,
            integration,
            limit,
          });
          let source: "local" | "live" = "local";
          if (live || bots.length === 0) {
            const res = await listBots({
              q,
              category,
              integration,
              limit: Math.min(Math.max(limit || 25, 1), 100),
              sort: "newest",
            });
            bots = res.bots;
            source = "live";
          }
          return json({ source, bots }, cors);
        }

        if (url.pathname === "/api/botdirectory/sync" && req.method === "POST") {
          const body = (await req.json().catch(() => ({}))) as {
            full?: boolean;
            reset?: boolean;
            maxPages?: number;
          };
          if (body.full) {
            const total = await mirrorFullFeed(
              services.runtime.paths.botdirectoryCatalog,
            );
            return json({ ok: true, mode: "full", total }, cors);
          }
          const result = await syncCatalog(
            services.runtime.paths.botdirectoryCatalog,
            {
              maxPages: body.maxPages ?? 5,
              reset: body.reset,
            },
          );
          return json({ ok: true, mode: "cursor", ...result }, cors);
        }

        if (
          url.pathname === "/api/botdirectory/signup" &&
          req.method === "POST"
        ) {
          const body = (await req.json()) as { username?: string };
          const username = body.username?.trim().toLowerCase() ?? "";
          if (username.length < 3 || username.length > 32) {
            return json(
              { error: "username must be 3–32 characters" },
              cors,
              400,
            );
          }
          const result = await botdirectorySignup(username);
          services.runtime.setProviderCredential("botdirectory", {
            apiKey: result.password,
            username: result.username,
          });
          await services.reloadPlugins();
          return json(
            {
              ok: true,
              username: result.username,
              // Password stored locally — never returned.
            },
            cors,
            201,
          );
        }

        if (
          url.pathname === "/api/botdirectory/credentials" &&
          req.method === "PUT"
        ) {
          const body = (await req.json()) as {
            username?: string;
            password?: string;
          };
          if (!body.password?.trim()) {
            return json({ error: "password required" }, cors, 400);
          }
          services.runtime.setProviderCredential("botdirectory", {
            apiKey: body.password.trim(),
            username: body.username?.trim(),
          });
          await services.reloadPlugins();
          let me: { username: string | null; owner?: boolean } | null = null;
          try {
            me = await whoAmI(body.password.trim());
            if (me.username) {
              services.runtime.setProviderCredential("botdirectory", {
                username: me.username,
              });
            }
          } catch {
            // keep stored even if /me fails (offline)
          }
          return json(
            {
              ok: true,
              username:
                me?.username ??
                body.username?.trim() ??
                services.runtime.secrets.providers.botdirectory?.username ??
                null,
            },
            cors,
          );
        }

        if (
          url.pathname === "/api/botdirectory/import" &&
          req.method === "POST"
        ) {
          const body = (await req.json()) as {
            slug?: string;
            name?: string;
            model?: string;
          };
          const slug = body.slug?.trim();
          if (!slug) return json({ error: "slug required" }, cors, 400);
          const catalog = loadCatalog(
            services.runtime.paths.botdirectoryCatalog,
          );
          let bot: BotdirectoryBot | undefined = catalog.bots[slug];
          if (!bot) {
            const live = await listBots({ q: slug, limit: 50, sort: "name" });
            bot = live.bots.find((b) => b.slug === slug);
          }
          if (!bot) {
            return json({ error: `bot "${slug}" not found` }, cors, 404);
          }
          const agent = services.agents.create(
            {
              name: body.name?.trim() || bot.name,
              description: `Imported from botdirectory.ai (${bot.slug}) · ${bot.category}`,
              instructions: [
                bot.prompt,
                "",
                `Source: ${bot.detailUrl}`,
                `Integrations: ${bot.integrations.join(", ") || "none"}`,
                "You run in Sora. Use linked plugins (GitHub, Composio, MCP) when the user connects them.",
              ].join("\n"),
              model: body.model,
              slug: slug.slice(0, 64),
            },
            services.runtime.config.defaultModel,
          );
          return json({ ok: true, agent, bot }, cors, 201);
        }

        if (
          url.pathname === "/api/botdirectory/publish" &&
          req.method === "POST"
        ) {
          const password =
            services.runtime.secrets.providers.botdirectory?.apiKey?.trim();
          if (!password) {
            return json(
              { error: "botdirectory write password not configured" },
              cors,
              400,
            );
          }
          const body = (await req.json()) as {
            agentSlug?: string;
            name?: string;
            category?: string;
            prompt?: string;
            integrations?: string[];
            url?: string;
          };
          let name = body.name?.trim();
          let prompt = body.prompt;
          let category = body.category?.trim();
          let integrations = body.integrations ?? [];
          if (body.agentSlug?.trim()) {
            const agent = services.agents.requireBySlugOrName(
              body.agentSlug.trim(),
            );
            name = name || agent.name;
            prompt = prompt ?? agent.instructions;
          }
          if (!name || !prompt || !category) {
            return json(
              {
                error:
                  "name, category, and prompt required (or agentSlug + category)",
              },
              cors,
              400,
            );
          }
          if (!integrations.length) integrations = ["Sora"];
          const result = await publishBot(password, {
            name,
            category,
            prompt,
            integrations,
            url: body.url,
            addedVia: "sora",
          });
          return json({ ok: true, ...result }, cors, 201);
        }

        if (
          url.pathname === "/api/botdirectory/newsletter" &&
          req.method === "POST"
        ) {
          const body = (await req.json()) as { email?: string };
          const email = body.email?.trim().toLowerCase() ?? "";
          if (!email.includes("@")) {
            return json({ error: "valid email required" }, cors, 400);
          }
          const result = await subscribeNewsletter(email, "bot");
          return json(result, cors);
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
          let files: string[] = [];
          try {
            const { readdirSync, statSync } = await import("node:fs");
            const entries = readdirSync(computer.workspaceRoot);
            files = entries
              .filter((name) => {
                if (name.startsWith(".")) return false;
                try {
                  return !statSync(
                    `${computer.workspaceRoot}/${name}`,
                  ).isDirectory();
                } catch {
                  return true;
                }
              })
              .slice(0, 40);
          } catch {
            files = [];
          }
          const sandbox =
            "sandboxInfo" in computer
              ? (computer as { sandboxInfo?: { id?: string; provider?: string } })
                  .sandboxInfo ?? null
              : null;
          return json(
            {
              agentSlug: agent.slug,
              workspaceRoot: computer.workspaceRoot,
              kind: computer.kind,
              provider: computer.provider,
              capabilities: computer.capabilities,
              browser: computer.browser.status(),
              files,
              sandbox,
            },
            cors,
          );
        }

        const displayMatch =
          /^\/api\/agents\/([^/]+)\/computer\/display$/.exec(url.pathname);
        if (displayMatch && req.method === "GET") {
          const slug = decodeURIComponent(displayMatch[1]!);
          const agent = services.agents.requireBySlugOrName(slug);
          await services.permissions.assert({
            agentId: agent.id,
            agentSlug: agent.slug,
            action: "browser.screenshot",
            resource: "viewport",
          });
          const computer = services.runner.getComputer(agent);
          let frame = null;
          try {
            frame = computer.display
              ? await computer.display.snapshot()
              : null;
          } catch {
            frame = null;
          }
          return json(
            {
              ok: Boolean(computer.capabilities.display),
              watching: Boolean(computer.capabilities.display),
              frame,
            },
            cors,
          );
        }

        const takeoverMatch =
          /^\/api\/agents\/([^/]+)\/computer\/takeover$/.exec(url.pathname);
        if (takeoverMatch && req.method === "POST") {
          const slug = decodeURIComponent(takeoverMatch[1]!);
          const agent = services.agents.requireBySlugOrName(slug);
          await services.permissions.assert({
            agentId: agent.id,
            agentSlug: agent.slug,
            action: "browser.screenshot",
            resource: "takeover",
          });
          const computer = services.runner.getComputer(agent);
          if (!computer.display?.requestTakeover) {
            return json(
              {
                ok: false,
                error:
                  "This teammate’s computer isn’t a cloud desktop yet. Add an E2B key and set Computer to cloud sandbox.",
                message:
                  "This teammate’s computer isn’t a cloud desktop yet. Add an E2B key under Connections.",
              },
              cors,
              400,
            );
          }
          let result: { ok: boolean; message: string };
          try {
            result = await computer.display.requestTakeover();
          } catch (err) {
            const message =
              err instanceof Error ? err.message : String(err);
            return json(
              {
                ok: false,
                error: message,
                message: `Couldn’t start the desktop: ${message}`,
              },
              cors,
              400,
            );
          }
          return json(
            {
              ok: result.ok,
              streamUrl: result.ok ? result.message : undefined,
              error: result.ok ? undefined : result.message,
              message: result.ok
                ? "Open the stream URL to type and click on the desktop."
                : result.message,
            },
            cors,
            result.ok ? 200 : 400,
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
          const { resolveComputerConfig } = await import("@sora/core");
          const computer = resolveComputerConfig(services.runtime.config);
          return json(
            {
              defaultModel: services.runtime.config.defaultModel,
              displayName: services.runtime.config.displayName ?? null,
              browser: services.runtime.config.browser ?? "on",
              computer,
              sandbox: services.runtime.config.sandbox ?? {
                enabled: computer.provider !== "local",
                provider: computer.provider,
              },
              home: services.runtime.paths.home,
            },
            cors,
          );
        }

        if (url.pathname === "/api/config" && req.method === "PUT") {
          const body = (await req.json()) as {
            defaultModel?: string;
            displayName?: string;
            browser?: "on" | "off";
            computer?: {
              provider?: string;
              failClosed?: boolean;
              idleMs?: number;
              commandTimeoutMs?: number;
              preferDisplay?: boolean;
            };
            sandbox?: {
              enabled?: boolean;
              provider?: "local" | "e2b" | "daytona" | "fake";
              failClosed?: boolean;
              idleMs?: number;
              commandTimeoutMs?: number;
            };
          };
          type ComputerProvider =
            | "local"
            | "e2b"
            | "daytona"
            | "fake"
            | "docker"
            | "remote"
            | "host";
          const patch: {
            defaultModel?: string;
            displayName?: string;
            browser?: "on" | "off";
            computer?: {
              provider: ComputerProvider;
              failClosed?: boolean;
              idleMs?: number;
              commandTimeoutMs?: number;
              preferDisplay?: boolean;
            };
            sandbox?: {
              enabled: boolean;
              provider: "local" | "e2b" | "daytona" | "fake";
              failClosed?: boolean;
              idleMs?: number;
              commandTimeoutMs?: number;
            };
          } = {};

          if (body.displayName !== undefined) {
            patch.displayName = body.displayName.trim().slice(0, 64);
          }

          if (body.defaultModel?.trim()) {
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
            patch.defaultModel = ref;
          }

          if (body.browser === "on" || body.browser === "off") {
            patch.browser = body.browser;
          }

          if (body.computer?.provider) {
            const { resolveComputerConfig } = await import("@sora/core");
            const prev = resolveComputerConfig(services.runtime.config);
            patch.computer = {
              provider: body.computer.provider as ComputerProvider,
              failClosed: body.computer.failClosed ?? prev.failClosed,
              idleMs: body.computer.idleMs ?? prev.idleMs,
              commandTimeoutMs:
                body.computer.commandTimeoutMs ?? prev.commandTimeoutMs,
              preferDisplay: body.computer.preferDisplay ?? prev.preferDisplay,
            };
          } else if (body.sandbox) {
            const prev = services.runtime.config.sandbox ?? {
              enabled: false,
              provider: "local" as const,
              failClosed: true,
              idleMs: 600_000,
              commandTimeoutMs: 120_000,
            };
            patch.sandbox = {
              enabled: body.sandbox.enabled ?? prev.enabled,
              provider: body.sandbox.provider ?? prev.provider,
              failClosed: body.sandbox.failClosed ?? prev.failClosed ?? true,
              idleMs: body.sandbox.idleMs ?? prev.idleMs ?? 600_000,
              commandTimeoutMs:
                body.sandbox.commandTimeoutMs ??
                prev.commandTimeoutMs ??
                120_000,
            };
          }

          if (
            !patch.defaultModel &&
            !patch.browser &&
            !patch.sandbox &&
            !patch.computer &&
            patch.displayName === undefined
          ) {
            return json(
              {
                error:
                  "displayName, defaultModel, browser, computer, or sandbox is required",
              },
              cors,
              400,
            );
          }

          const config = services.runtime.updateConfig(patch);
          if (patch.computer || patch.sandbox) {
            await services.runner.computers.disposeAll();
          }
          const { resolveComputerConfig } = await import("@sora/core");
          const computer = resolveComputerConfig(config);
          return json(
            {
              defaultModel: config.defaultModel,
              displayName: config.displayName ?? null,
              browser: config.browser ?? "on",
              computer,
              sandbox: config.sandbox ?? {
                enabled: computer.provider !== "local",
                provider: computer.provider,
              },
            },
            cors,
          );
        }

        if (url.pathname === "/api/providers" && req.method === "GET") {
          const catalog = services.providers.modelCatalog(
            services.runtime.secrets,
          );
          return json(
            {
              providers: catalog.providers,
              models: catalog.models,
              defaultModel: services.runtime.config.defaultModel,
            },
            cors,
          );
        }

        if (url.pathname === "/api/browser/status" && req.method === "GET") {
          const { getBrowserInstallStatus } = await import("@sora/computer");
          const status = await getBrowserInstallStatus();
          return json(status, cors);
        }

        if (url.pathname === "/api/browser/install" && req.method === "POST") {
          const { installPlaywrightChromium } = await import("@sora/computer");
          const result = await installPlaywrightChromium();
          return json(result, cors, result.ok ? 200 : 500);
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
            username?: string;
          };
          services.runtime.setProviderCredential(id, {
            apiKey: body.apiKey,
            baseUrl: body.baseUrl,
            username: body.username,
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
            rememberSession?: boolean;
          };
          if (!body.requestId?.trim()) {
            return json({ error: "requestId is required" }, cors, 400);
          }
          if (body.decision !== "allow" && body.decision !== "deny") {
            return json({ error: "decision must be allow or deny" }, cors, 400);
          }
          const ok = permissionAsk.respond(body.requestId, body.decision, {
            rememberSession: Boolean(body.rememberSession),
          });
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

  services.workflowEngine.startScheduler();
  void services.runtime.events.emit(
    "runtime.started",
    { url, port: server.port },
    "api",
  );

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
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
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

function normalizeMcpServer(
  raw: Partial<McpServerConfig> | null | undefined,
): McpServerConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const name = String(raw.name ?? id).trim();
  const transport = raw.transport === "http" ? "http" : "stdio";
  if (!id || !name) return null;
  if (transport === "stdio" && !String(raw.command ?? "").trim()) return null;
  if (transport === "http" && !String(raw.url ?? "").trim()) return null;
  return {
    id,
    name,
    transport,
    command: raw.command?.trim(),
    args: Array.isArray(raw.args) ? raw.args.map(String) : undefined,
    env:
      raw.env && typeof raw.env === "object"
        ? Object.fromEntries(
            Object.entries(raw.env).map(([k, v]) => [k, String(v)]),
          )
        : undefined,
    url: raw.url?.trim(),
    headers:
      raw.headers && typeof raw.headers === "object"
        ? Object.fromEntries(
            Object.entries(raw.headers).map(([k, v]) => [k, String(v)]),
          )
        : undefined,
    enabled: raw.enabled !== false,
  };
}
