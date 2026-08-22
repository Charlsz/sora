import {
  createAgent,
  createSoraServices,
  initSora,
  type CreateSoraServicesOptions,
} from "@sora/agents";
import { PermissionAskBridge, startApiServer } from "@sora/api";
import { resolve } from "node:path";

const HELP = `Sora — local AI agent runtime

Usage:
  sora <command> [options]

Commands:
  init                         Initialize ~/.sora workspace
  agent list                   List agents
  agent create <name>          Create an agent
  agent run <name> <prompt>    Run an agent with a prompt
  skill list                   List installed/discovered skills
  skill get <name>             Show a skill
  skill install <path>         Install a skill into ~/.sora/skills
  skill remove <name>          Remove an installed skill
  workflow list                List workflows
  workflow create <name>       Create a workflow
  workflow run <name>          Run a workflow manually
  workflow trigger <path>      Dispatch webhook workflows by path
  workflow tick                Evaluate due cron workflows once
  workflow enable <name>       Enable a workflow
  workflow disable <name>      Disable a workflow
  workflow remove <name>       Delete a workflow
  computer list                List agent computers / workspaces
  provider list                List LLM providers and connection status
  provider set <id>            Save API key / base URL for a provider
  provider clear <id>          Remove saved credentials for a provider
  provider test [model]        Send a tiny chat to verify the model works
  model get                    Show default model
  model set <provider:model>   Set default model (e.g. openrouter:openai/gpt-4o-mini)
  start                        Start local API server (for the web UI)
  version                      Print version
  help                         Show this help

Options:
  --model <ref>                Model for agent create (default: config/default)
  --description <text>         Description for agent create
  --skill <name>               Activate a skill for agent/workflow run
  --agent <slug>               Agent for workflow create
  --task <text>                Task prompt for workflow create
  --cron <expr>                Cron trigger (5-field) for workflow create
  --webhook <path>             Webhook trigger path for workflow create
  --secret <value>             Optional webhook secret
  --key <api-key>              API key for provider set
  --base-url <url>             Base URL for provider set (OpenAI-compatible)
  --home <path>                Override SORA_HOME
  --port <n>                   API port for sora start (default 7420)
  --yes, -y                    Auto-approve permission prompts
  --json                       Machine-readable output where supported

Examples:
  bun run sora init
  bun run sora provider set openrouter --key sk-or-...
  bun run sora model set openrouter:openai/gpt-4o-mini
  bun run sora provider test
  bun run sora start
  bun run sora start --yes
  bun run sora skill install ./examples/skills/github-review
  bun run sora agent create klaus --description "Executive assistant"
  bun run sora workflow create morning-brief --agent klaus --task "Prepare my morning briefing" --cron "0 7 * * 1-5"
  bun run sora workflow run morning-brief --yes
  bun run sora workflow trigger github/pr --yes
`;

type Flags = Record<string, string | boolean>;

export async function main(argv: string[]): Promise<void> {
  const { command, args, flags } = parseArgs(argv);

  if (flags.home && typeof flags.home === "string") {
    process.env.SORA_HOME = flags.home;
  }

  if (flags.yes || flags.y) {
    process.env.SORA_AUTO_APPROVE = "1";
  }

  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;

    case "version":
    case "--version":
    case "-v":
      console.log("sora 0.1.0");
      return;

    case "init": {
      const { runtime, config } = initSora({
        home: typeof flags.home === "string" ? flags.home : undefined,
        force: Boolean(flags.force),
      });
      console.log(`Initialized Sora at ${runtime.paths.home}`);
      console.log(`Default model: ${config.defaultModel}`);
      console.log(`Shared skills: ${runtime.paths.skills}`);
      runtime.close();
      return;
    }

    case "agent": {
      await handleAgent(args, flags);
      return;
    }

    case "skill": {
      await handleSkill(args, flags);
      return;
    }

    case "workflow": {
      await handleWorkflow(args, flags);
      return;
    }

    case "computer": {
      await handleComputer(args, flags);
      return;
    }

    case "provider": {
      await handleProvider(args, flags);
      return;
    }

    case "model": {
      await handleModel(args, flags);
      return;
    }

    case "start": {
      await handleStart(flags);
      return;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

function servicesOptions(flags: Flags): CreateSoraServicesOptions {
  return {
    permissions: {
      autoApprove: Boolean(flags.yes || flags.y),
    },
  };
}

async function handleStart(flags: Flags): Promise<void> {
  try {
    createSoraServices(servicesOptions(flags)).runtime.close();
  } catch (error) {
    if (error instanceof Error && error.message.includes("not initialized")) {
      initSora();
    } else {
      throw error;
    }
  }

  // Interactive ask by default so the workspace UI can approve tools.
  // Pass --yes (or SORA_AUTO_APPROVE=1) for headless auto-approve.
  const autoApprove =
    Boolean(flags.yes || flags.y) ||
    process.env.SORA_AUTO_APPROVE === "1" ||
    process.env.SORA_AUTO_APPROVE === "true";

  const services = createSoraServices({
    permissions: { autoApprove },
  });

  const permissionAsk = autoApprove
    ? undefined
    : new PermissionAskBridge(services.runtime.events);
  if (permissionAsk) {
    services.permissions.setAsk(permissionAsk.createAskHandler());
  }

  const port =
    typeof flags.port === "string" ? Number(flags.port) : 7420;

  const staticDir = resolve(
    import.meta.dir,
    "../../apps/web/dist",
  );

  const server = startApiServer({
    services,
    port: Number.isFinite(port) ? port : 7420,
    staticDir,
    permissionAsk,
  });

  console.log(`Sora API listening on ${server.url}`);
  console.log(`UI: ${server.url} (build apps/web or use bun run dev:web)`);
  console.log(
    autoApprove
      ? "Permissions: auto-approve (--yes)"
      : "Permissions: interactive (approve in the UI)",
  );
  console.log("Press Ctrl+C to stop");

  const shutdown = () => {
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep process alive
  await new Promise(() => {});
}

async function handleSkill(args: string[], flags: Flags): Promise<void> {
  const sub = args[0];
  const rest = args.slice(1);

  if (!sub || sub === "help") {
    console.log(`Skill commands:
  sora skill list
  sora skill get <name>
  sora skill install <path>
  sora skill remove <name>`);
    return;
  }

  // Ensure workspace exists for skill home
  try {
    createSoraServices(servicesOptions(flags)).runtime.close();
  } catch (error) {
    if (error instanceof Error && error.message.includes("not initialized")) {
      initSora();
    } else {
      throw error;
    }
  }

  const services = createSoraServices(servicesOptions(flags));
  try {
    if (sub === "list") {
      const skills = services.skills.list();
      if (flags.json) {
        console.log(JSON.stringify(skills, null, 2));
        return;
      }
      if (!skills.length) {
        console.log(
          "No skills installed. Try: sora skill install ./examples/skills/github-review",
        );
        return;
      }
      for (const skill of skills) {
        console.log(
          `${skill.id.padEnd(20)} ${skill.description}`,
        );
      }
      return;
    }

    if (sub === "get") {
      const name = rest[0];
      if (!name) throw new Error("Usage: sora skill get <name>");
      const skill = services.skills.get(name);
      if (flags.json) {
        console.log(JSON.stringify(skill, null, 2));
        return;
      }
      console.log(`Name: ${skill.name}`);
      console.log(`Id: ${skill.id}`);
      console.log(`Description: ${skill.description}`);
      console.log(`Tools: ${skill.tools.join(", ")}`);
      console.log(`Path: ${skill.path}`);
      console.log("");
      console.log(skill.instructions);
      return;
    }

    if (sub === "install") {
      const path = rest[0];
      if (!path) throw new Error("Usage: sora skill install <path>");
      const skill = services.skills.install(resolve(path));
      console.log(`Installed skill ${skill.id}`);
      console.log(`Path: ${skill.path}`);
      return;
    }

    if (sub === "remove") {
      const name = rest[0];
      if (!name) throw new Error("Usage: sora skill remove <name>");
      services.skills.remove(name);
      console.log(`Removed skill ${name}`);
      return;
    }

    throw new Error(`Unknown skill command: ${sub}`);
  } finally {
    services.runtime.close();
  }
}

async function handleComputer(args: string[], flags: Flags): Promise<void> {
  const sub = args[0] ?? "list";
  const services = createSoraServices(servicesOptions(flags));
  try {
    if (sub !== "list") {
      throw new Error(`Unknown computer command: ${sub}`);
    }
    const agents = services.agents.list();
    if (!agents.length) {
      console.log("No agent computers yet.");
      return;
    }
    for (const agent of agents) {
      const workspace = services.runtime.paths.agent(agent.slug).workspace;
      console.log(`${agent.slug.padEnd(16)} local  ${workspace}`);
    }
  } finally {
    services.runtime.close();
  }
}

async function handleWorkflow(args: string[], flags: Flags): Promise<void> {
  const sub = args[0];
  const rest = args.slice(1);

  if (!sub || sub === "help") {
    console.log(`Workflow commands:
  sora workflow list
  sora workflow create <name> --agent <slug> --task <text> [--cron expr | --webhook path] [--skill name]
  sora workflow run <name>
  sora workflow trigger <path> [--secret value]
  sora workflow tick
  sora workflow enable|disable|remove <name>`);
    return;
  }

  try {
    createSoraServices(servicesOptions(flags)).runtime.close();
  } catch (error) {
    if (error instanceof Error && error.message.includes("not initialized")) {
      initSora();
    } else {
      throw error;
    }
  }

  const services = createSoraServices(servicesOptions(flags));

  if (!flags.quiet) {
    services.runtime.events.on("*", (event) => {
      if (event.type.startsWith("workflow.")) {
        console.error(`${event.type}${event.data?.slug ? ` ${event.data.slug}` : ""}`);
      } else if (event.type === "agent.tool.started") {
        console.error(`→ tool ${event.data?.tool}`);
      } else if (event.type === "agent.tool.completed") {
        console.error(`✓ tool ${event.data?.tool}`);
      } else if (event.type === "permission.requested") {
        console.error(
          `permission ${event.data?.action} → ${event.data?.decision}`,
        );
      }
    });
  }

  try {
    if (sub === "list") {
      const items = services.workflows.list();
      if (flags.json) {
        console.log(JSON.stringify(items, null, 2));
        return;
      }
      if (!items.length) {
        console.log("No workflows yet.");
        return;
      }
      for (const wf of items) {
        const trig =
          wf.trigger.type === "cron"
            ? `cron ${wf.trigger.expression}`
            : wf.trigger.type === "webhook"
              ? `webhook /${wf.trigger.path}`
              : wf.trigger.type;
        console.log(
          `${wf.slug.padEnd(20)} ${(wf.enabled ? "on" : "off").padEnd(4)} ${wf.agentSlug.padEnd(12)} ${trig.padEnd(24)} ${wf.task}`,
        );
      }
      return;
    }

    if (sub === "create") {
      const name = rest[0];
      const agent = typeof flags.agent === "string" ? flags.agent : undefined;
      const task = typeof flags.task === "string" ? flags.task : undefined;
      if (!name || !agent || !task) {
        throw new Error(
          "Usage: sora workflow create <name> --agent <slug> --task <text> [--cron expr | --webhook path]",
        );
      }

      let trigger: import("@sora/workflows").WorkflowTrigger = { type: "manual" };
      if (typeof flags.cron === "string") {
        trigger = { type: "cron", expression: flags.cron };
      } else if (typeof flags.webhook === "string") {
        trigger = {
          type: "webhook",
          path: flags.webhook,
          secret: typeof flags.secret === "string" ? flags.secret : undefined,
        };
      }

      const wf = services.workflows.create({
        name,
        agent,
        task,
        skill: typeof flags.skill === "string" ? flags.skill : undefined,
        description:
          typeof flags.description === "string" ? flags.description : undefined,
        trigger,
      });
      services.workflowEngine.refreshSchedule(wf.slug);

      if (flags.json) {
        console.log(JSON.stringify(wf, null, 2));
      } else {
        console.log(`Created workflow ${wf.slug}`);
        console.log(`Agent: ${wf.agentSlug}`);
        console.log(`Trigger: ${wf.trigger.type}`);
      }
      return;
    }

    if (sub === "run") {
      const name = rest[0];
      if (!name) throw new Error("Usage: sora workflow run <name>");
      const run = await services.workflowEngine.run(name);
      if (flags.json) {
        console.log(JSON.stringify(run, null, 2));
      } else if (run.status === "failed") {
        console.error(run.error);
        process.exitCode = 1;
      } else {
        console.log(run.reply ?? "(no reply)");
      }
      return;
    }

    if (sub === "trigger") {
      const path = rest[0];
      if (!path) throw new Error("Usage: sora workflow trigger <path>");
      const runs = await services.workflowEngine.handleWebhook({
        path,
        secret: typeof flags.secret === "string" ? flags.secret : undefined,
      });
      if (flags.json) {
        console.log(JSON.stringify(runs, null, 2));
        return;
      }
      if (!runs.length) {
        console.log("No matching webhook workflows.");
        return;
      }
      for (const run of runs) {
        console.log(
          `${run.status.padEnd(10)} ${run.id} ${run.reply ?? run.error ?? ""}`,
        );
      }
      return;
    }

    if (sub === "tick") {
      const runs = await services.workflowEngine.tick();
      if (flags.json) {
        console.log(JSON.stringify(runs, null, 2));
        return;
      }
      console.log(`Fired ${runs.length} cron workflow(s)`);
      return;
    }

    if (sub === "enable" || sub === "disable") {
      const name = rest[0];
      if (!name) throw new Error(`Usage: sora workflow ${sub} <name>`);
      const wf = services.workflows.setEnabled(name, sub === "enable");
      console.log(`${wf.slug} ${wf.enabled ? "enabled" : "disabled"}`);
      return;
    }

    if (sub === "remove") {
      const name = rest[0];
      if (!name) throw new Error("Usage: sora workflow remove <name>");
      services.workflows.remove(name);
      console.log(`Removed workflow ${name}`);
      return;
    }

    throw new Error(`Unknown workflow command: ${sub}`);
  } finally {
    services.workflowEngine.stopScheduler();
    services.runtime.close();
  }
}

async function handleAgent(args: string[], flags: Flags): Promise<void> {
  const sub = args[0];
  const rest = args.slice(1);

  if (!sub || sub === "help") {
    console.log(`Agent commands:
  sora agent list
  sora agent create <name> [--description ...] [--model provider:model]
  sora agent run <name> <prompt> [--skill <name>] [--yes]
  sora agent run <name> "/skill-name optional task" --yes`);
    return;
  }

  if (sub === "create") {
    const name = rest[0];
    if (!name) {
      throw new Error("Usage: sora agent create <name>");
    }

    try {
      const services = createSoraServices(servicesOptions(flags));
      const agent = await createAgent(services, {
        name,
        description:
          typeof flags.description === "string" ? flags.description : undefined,
        model: typeof flags.model === "string" ? flags.model : undefined,
      });
      if (flags.json) {
        console.log(JSON.stringify(agent, null, 2));
      } else {
        console.log(`Created agent ${agent.name} (${agent.slug})`);
        console.log(`Model: ${agent.model}`);
        console.log(
          `Workspace: ${services.runtime.paths.agent(agent.slug).workspace}`,
        );
      }
      services.runtime.close();
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("not initialized")
      ) {
        initSora();
        return handleAgent(args, flags);
      }
      throw error;
    }
    return;
  }

  const services = createSoraServices(servicesOptions(flags));

  try {
    if (sub === "list") {
      const agents = services.agents.list();
      if (flags.json) {
        console.log(JSON.stringify(agents, null, 2));
        return;
      }
      if (!agents.length) {
        console.log("No agents yet. Create one with: sora agent create <name>");
        return;
      }
      for (const agent of agents) {
        console.log(
          `${agent.slug.padEnd(16)} ${agent.status.padEnd(8)} ${agent.model.padEnd(20)} ${agent.description || agent.name}`,
        );
      }
      return;
    }

    if (sub === "run") {
      const name = rest[0];
      const prompt = rest.slice(1).join(" ").trim();
      if (!name || !prompt) {
        throw new Error('Usage: sora agent run <name> "<prompt>"');
      }

      if (!flags.quiet) {
        services.runtime.events.on("*", (event) => {
          if (event.type === "agent.tool.started") {
            console.error(`→ tool ${event.data?.tool}`);
          } else if (event.type === "agent.tool.completed") {
            console.error(`✓ tool ${event.data?.tool}`);
          } else if (event.type === "agent.tool.failed") {
            console.error(`✗ tool ${event.data?.tool}: ${event.data?.error}`);
          } else if (event.type === "permission.requested") {
            console.error(
              `permission ${event.data?.action} → ${event.data?.decision}`,
            );
          }
        });
      }

      const skill =
        typeof flags.skill === "string" ? flags.skill : undefined;

      const result = await services.runner.run({
        agent: name,
        prompt,
        skill,
      });
      if (flags.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.skillId) {
          console.error(`skill ${result.skillId}`);
        }
        console.log(result.reply);
      }
      return;
    }

    throw new Error(`Unknown agent command: ${sub}`);
  } finally {
    services.runtime.close();
  }
}

async function handleProvider(args: string[], flags: Flags): Promise<void> {
  const sub = args[0];
  const rest = args.slice(1);

  if (!sub || sub === "help") {
    console.log(`Provider commands:
  sora provider list
  sora provider set <id> --key <api-key> [--base-url <url>]
  sora provider clear <id>
  sora provider test [provider:model]

Providers: openai · openrouter · ollama · mock`);
    return;
  }

  try {
    createSoraServices(servicesOptions(flags)).runtime.close();
  } catch (error) {
    if (error instanceof Error && error.message.includes("not initialized")) {
      initSora();
    } else {
      throw error;
    }
  }

  const services = createSoraServices(servicesOptions(flags));
  try {
    if (sub === "list") {
      const status = services.providers.status(services.runtime.secrets);
      if (flags.json) {
        console.log(
          JSON.stringify(
            {
              defaultModel: services.runtime.config.defaultModel,
              providers: status,
            },
            null,
            2,
          ),
        );
        return;
      }
      console.log(`Default model: ${services.runtime.config.defaultModel}`);
      for (const p of status) {
        const state = p.configured
          ? p.fromEnv
            ? "env"
            : p.hint ?? "ok"
          : "not configured";
        console.log(
          `${p.id.padEnd(12)} ${state.padEnd(16)} ${p.description}`,
        );
      }
      return;
    }

    if (sub === "set") {
      const id = rest[0];
      if (!id) throw new Error("Usage: sora provider set <id> --key <api-key>");
      const key =
        typeof flags.key === "string"
          ? flags.key
          : typeof flags["api-key"] === "string"
            ? flags["api-key"]
            : undefined;
      const baseUrl =
        typeof flags["base-url"] === "string"
          ? flags["base-url"]
          : typeof flags.baseUrl === "string"
            ? flags.baseUrl
            : undefined;
      if (key === undefined && baseUrl === undefined) {
        throw new Error("Provide --key and/or --base-url");
      }
      services.runtime.setProviderCredential(id, {
        apiKey: key,
        baseUrl,
      });
      services.reloadProviders();
      console.log(`Saved credentials for ${id} → ${services.runtime.paths.secrets}`);
      return;
    }

    if (sub === "clear") {
      const id = rest[0];
      if (!id) throw new Error("Usage: sora provider clear <id>");
      services.runtime.clearProviderCredential(id);
      services.reloadProviders();
      console.log(`Cleared credentials for ${id}`);
      return;
    }

    if (sub === "test") {
      const model =
        rest[0] ?? services.runtime.config.defaultModel;
      const { provider, model: modelId } = services.providers.resolve(model);
      const response = await provider.chat({
        model: modelId,
        messages: [{ role: "user", content: "Reply with exactly: sora-ok" }],
        maxTokens: 32,
      });
      if (flags.json) {
        console.log(
          JSON.stringify(
            { ok: true, model, reply: response.message.content },
            null,
            2,
          ),
        );
      } else {
        console.log(`ok · ${model}`);
        console.log(response.message.content ?? "");
      }
      return;
    }

    throw new Error(`Unknown provider command: ${sub}`);
  } finally {
    services.runtime.close();
  }
}

async function handleModel(args: string[], flags: Flags): Promise<void> {
  const sub = args[0];
  const rest = args.slice(1);

  if (!sub || sub === "help") {
    console.log(`Model commands:
  sora model get
  sora model set <provider:model>`);
    return;
  }

  try {
    createSoraServices(servicesOptions(flags)).runtime.close();
  } catch (error) {
    if (error instanceof Error && error.message.includes("not initialized")) {
      initSora();
    } else {
      throw error;
    }
  }

  const services = createSoraServices(servicesOptions(flags));
  try {
    if (sub === "get") {
      const model = services.runtime.config.defaultModel;
      if (flags.json) console.log(JSON.stringify({ defaultModel: model }));
      else console.log(model);
      return;
    }

    if (sub === "set") {
      const model = rest[0];
      if (!model) throw new Error("Usage: sora model set <provider:model>");
      services.providers.resolve(model);
      services.runtime.updateConfig({ defaultModel: model });
      console.log(`Default model → ${model}`);
      return;
    }

    throw new Error(`Unknown model command: ${sub}`);
  } finally {
    services.runtime.close();
  }
}

function parseArgs(argv: string[]): {
  command?: string;
  args: string[];
  flags: Flags;
} {
  const flags: Flags = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    } else if (token.startsWith("-") && token.length === 2) {
      flags[token.slice(1)] = true;
    } else {
      positional.push(token);
    }
  }

  return {
    command: positional[0],
    args: positional.slice(1),
    flags,
  };
}
