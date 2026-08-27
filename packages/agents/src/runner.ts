import type { EventBus, SoraPaths, SoraRuntime } from "@sora/core";
import {
  ComputerRegistry,
  collectSecretValues,
  createAgentComputer,
  scrubSecretsFromText,
  type Computer,
} from "@sora/computer";
import type { ConversationStore, MemoryStore } from "@sora/memory";
import type {
  ChatMessage,
  ChatToolDefinition,
  ModelProvider,
  ProviderRegistry,
} from "@sora/models";
import type { PermissionGate } from "@sora/permissions";
import { listComposioConnections } from "@sora/plugins";
import {
  parseSkillSlashCommand,
  type SkillInvocation,
  type SkillRegistry,
} from "@sora/skills";
import type { Tool, ToolRegistry } from "@sora/tools";
import { join } from "node:path";
import type { DelegationService } from "./delegation.ts";
import type { AgentInboxStore } from "./inbox.ts";
import type { AgentStore } from "./store.ts";
import type { Agent } from "./types.ts";

export type RunAgentInput = {
  agent: string;
  prompt: string;
  conversationId?: string;
  maxToolRounds?: number;
  /** Activate a shared skill for this run. */
  skill?: string;
};

export type RunAgentResult = {
  agent: Agent;
  conversationId: string;
  reply: string;
  toolCalls: Array<{ name: string; ok: boolean; output: string }>;
  skillId?: string;
};

export class AgentRunner {
  #delegation: DelegationService | null = null;
  #skills: SkillRegistry | null = null;
  /** Nested run refcounts per agent id (delegation-safe status). */
  #activeRuns = new Map<string, number>();
  /** Nested agent_message deliver=run depth (mirrors delegation limits). */
  #messageDepth = 0;
  #messageChain: string[] = [];
  #composioStatusCache: { at: number; text: string } | null = null;
  /** Long-lived per-agent computers (browser profiles stay warm). */
  readonly computers = new ComputerRegistry();

  constructor(
    private readonly agents: AgentStore,
    private readonly providers: ProviderRegistry,
    private readonly tools: ToolRegistry,
    private readonly conversations: ConversationStore,
    private readonly memory: MemoryStore,
    private readonly paths: SoraPaths,
    private readonly events: EventBus,
    private readonly permissions: PermissionGate,
    private readonly runtime: SoraRuntime,
    private readonly inbox: AgentInboxStore | null = null,
  ) {}

  setDelegation(delegation: DelegationService): void {
    this.#delegation = delegation;
  }

  setSkills(skills: SkillRegistry): void {
    this.#skills = skills;
  }

  /** Reuse the same computer (and browser session) for an agent. */
  getComputer(agent: Agent): Computer {
    const id = `agent:${agent.slug}`;
    return this.computers.getOrCreate(id, () => {
      const workspacePath = this.paths.agent(agent.slug).workspace;
      const profileDir = join(
        this.paths.agent(agent.slug).root,
        "browser-profile",
      );
      return createAgentComputer({
        id,
        workspaceRoot: workspacePath,
        browserProfileDir: profileDir,
        config: this.runtime.config,
        secrets: this.runtime.secrets,
      });
    });
  }

  /** Direct tool execution for workflow step replay. */
  async executeToolForWorkflow(
    agentSlug: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<{ ok: boolean; output: string; error?: string; data?: unknown }> {
    const agent = this.agents.requireBySlugOrName(agentSlug);
    const result = await this.#executeTool(
      agent,
      tool,
      JSON.stringify(args),
      null,
    );
    return {
      ok: result.ok,
      output: result.output,
      error: result.error,
      data: result.data,
    };
  }

  async dispose(): Promise<void> {
    await this.computers.disposeAll();
  }

  async run(input: RunAgentInput): Promise<RunAgentResult> {
    const agent = this.agents.requireBySlugOrName(input.agent);
    const maxToolRounds = input.maxToolRounds ?? 5;

    const { prompt, skillName } = this.#resolveSkillRequest(input);
    const skillInvocation = skillName
      ? this.#activateSkill(agent, skillName)
      : null;

    this.#beginRun(agent.id);
    await this.events.emit(
      "agent.started",
      {
        agentId: agent.id,
        slug: agent.slug,
        prompt,
        skill: skillInvocation?.skill.id,
      },
      "agents",
    );

    try {
      const conversation = input.conversationId
        ? await this.conversations.get(input.conversationId)
        : await this.conversations.create(agent.id, prompt.slice(0, 80));

      if (!conversation) {
        throw new Error(`Conversation "${input.conversationId}" not found`);
      }

      const inboxMessages = this.inbox?.listUnread(agent.id) ?? [];

      await this.conversations.appendMessage(conversation.id, {
        role: "user",
        content: prompt,
      });

      const history = await this.conversations.listMessages(conversation.id);
      const longTerm = await this.memory.retrieve({
        agentId: agent.id,
        limit: 5,
      });

      const toolDefs = this.#toolDefinitions(agent, skillInvocation);
      const composioStatus = await this.#composioStatusBlurb();
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: this.#systemPrompt(
            agent,
            longTerm.map((m) => m.content),
            skillInvocation,
            inboxMessages.map(
              (m) => `[${m.fromAgentSlug}] ${m.content}`,
            ),
            composioStatus,
          ),
        },
        ...history
          .filter((m) => m.role !== "system")
          .map(
            (m): ChatMessage => ({
              role: m.role,
              content: m.content,
              toolCallId: m.toolCallId,
              name: m.toolName,
            }),
          ),
      ];

      if (inboxMessages.length) {
        this.inbox?.markRead(inboxMessages.map((m) => m.id));
      }

      const { provider, model } = this.providers.resolve(agent.model);
      const toolCallLog: RunAgentResult["toolCalls"] = [];
      let reply = "";
      let activeSkill = skillInvocation;

      for (let round = 0; round <= maxToolRounds; round++) {
        const assistant = await this.#streamAssistantRound({
          provider,
          model,
          messages,
          tools: toolDefs.length ? toolDefs : undefined,
          agent,
          conversationId: conversation.id,
        });
        messages.push(assistant);

        if (assistant.toolCalls?.length) {
          await this.conversations.appendMessage(conversation.id, {
            role: "assistant",
            content: assistant.content ?? "",
            metadata: { toolCalls: assistant.toolCalls },
          });

          for (const call of assistant.toolCalls) {
            // Mid-run skill activation via invoke_skill tool
            if (call.name === "invoke_skill" && !activeSkill) {
              let args: { name?: string; task?: string } = {};
              try {
                args = JSON.parse(call.arguments || "{}");
              } catch {
                args = {};
              }
              if (args.name) {
                activeSkill = this.#activateSkill(agent, args.name);
                // Refresh tool defs for subsequent rounds
                toolDefs.length = 0;
                toolDefs.push(...this.#toolDefinitions(agent, activeSkill));
                messages[0] = {
                  role: "system",
                  content: this.#systemPrompt(
                    agent,
                    longTerm.map((m) => m.content),
                    activeSkill,
                    inboxMessages.map(
                      (m) => `[${m.fromAgentSlug}] ${m.content}`,
                    ),
                    composioStatus,
                  ),
                };
              }
            }

            await this.events.emit(
              "agent.tool.started",
              {
                agentId: agent.id,
                tool: call.name,
                arguments: call.arguments,
                skill: activeSkill?.skill.id,
              },
              "agents",
            );

            const result = await this.#executeTool(
              agent,
              call.name,
              call.arguments,
              activeSkill,
            );
            const secretValues = collectSecretValues(this.runtime.secrets);
            const scrubbed = {
              ...result,
              output: scrubSecretsFromText(result.output ?? "", secretValues),
              error: result.error
                ? scrubSecretsFromText(result.error, secretValues)
                : result.error,
            };
            toolCallLog.push({
              name: call.name,
              ok: scrubbed.ok,
              output: scrubbed.output,
            });

            await this.events.emit(
              scrubbed.ok ? "agent.tool.completed" : "agent.tool.failed",
              {
                agentId: agent.id,
                tool: call.name,
                ok: scrubbed.ok,
                output: scrubbed.output,
                error: scrubbed.error,
                skill: activeSkill?.skill.id,
              },
              "agents",
            );

            const toolContent = scrubbed.ok
              ? scrubbed.output
              : `Error: ${scrubbed.error ?? "tool failed"}`;

            messages.push({
              role: "tool",
              content: toolContent,
              toolCallId: call.id,
              name: call.name,
            });

            await this.conversations.appendMessage(conversation.id, {
              role: "tool",
              content: toolContent,
              toolName: call.name,
              toolCallId: call.id,
            });
          }
          continue;
        }

        reply = assistant.content?.trim() || "(empty response)";
        await this.conversations.appendMessage(conversation.id, {
          role: "assistant",
          content: reply,
        });
        await this.events.emit(
          "agent.message",
          { agentId: agent.id, role: "assistant", content: reply },
          "agents",
        );
        break;
      }

      if (!reply) {
        reply =
          "I reached the tool-call limit without a final answer. Try a simpler request.";
        await this.conversations.appendMessage(conversation.id, {
          role: "assistant",
          content: reply,
        });
      }

      this.#endRun(agent.id, "idle");
      await this.#maybeExtractMemory(agent, prompt, reply);
      await this.events.emit(
        "agent.completed",
        {
          agentId: agent.id,
          slug: agent.slug,
          conversationId: conversation.id,
          reply,
          skill: activeSkill?.skill.id,
        },
        "agents",
      );

      return {
        agent,
        conversationId: conversation.id,
        reply,
        toolCalls: toolCallLog,
        skillId: activeSkill?.skill.id,
      };
    } catch (error) {
      this.#endRun(agent.id, "error");
      const message = error instanceof Error ? error.message : String(error);
      await this.events.emit(
        "agent.failed",
        { agentId: agent.id, slug: agent.slug, error: message },
        "agents",
      );
      throw error;
    }
  }

  #resolveSkillRequest(input: RunAgentInput): {
    prompt: string;
    skillName?: string;
  } {
    if (input.skill) {
      return { prompt: input.prompt, skillName: input.skill };
    }
    const slash = parseSkillSlashCommand(input.prompt);
    if (slash) {
      return {
        skillName: slash.skillName,
        prompt:
          slash.rest ||
          `Execute the ${slash.skillName} skill on the current workspace.`,
      };
    }
    return { prompt: input.prompt };
  }

  #activateSkill(agent: Agent, skillName: string): SkillInvocation {
    if (!this.#skills) {
      throw new Error("Skill registry is not configured on this runner");
    }

    if (agent.skills.length > 0) {
      const needle = skillName.toLowerCase().replace(/^\/+/, "");
      const allowed = agent.skills.some((s) => {
        const ref = s.name.toLowerCase();
        return (
          ref === needle ||
          ref.replace(/[^a-z0-9]+/g, "-") === needle.replace(/[^a-z0-9]+/g, "-")
        );
      });
      if (!allowed) {
        throw new Error(
          `Skill "${skillName}" is not enabled for agent "${agent.slug}"`,
        );
      }
    }

    return this.#skills.prepareInvocation({
      skillName,
      agentToolNames: agent.tools.map((t) => t.name),
    });
  }

  #beginRun(agentId: string): void {
    const next = (this.#activeRuns.get(agentId) ?? 0) + 1;
    this.#activeRuns.set(agentId, next);
    this.agents.setStatus(agentId, "running");
  }

  #endRun(agentId: string, terminal: "idle" | "error"): void {
    const next = (this.#activeRuns.get(agentId) ?? 1) - 1;
    if (next <= 0) {
      this.#activeRuns.delete(agentId);
      this.agents.setStatus(agentId, terminal);
    } else {
      this.#activeRuns.set(agentId, next);
      this.agents.setStatus(agentId, "running");
    }
  }

  #systemPrompt(
    agent: Agent,
    memories: string[],
    skill: SkillInvocation | null,
    inbox: string[] = [],
    composioStatus: string | null = null,
  ): string {
    const workspace = this.paths.agent(agent.slug).workspace;
    const peers = this.agents
      .list()
      .filter((a) => a.id !== agent.id)
      .map((a) => `${a.name} (${a.slug})${a.description ? `: ${a.description}` : ""}`);
    const parts = [
      agent.instructions,
      `Teammate slug: ${agent.slug}`,
      `Computer files root: ${workspace}`,
      `Capabilities: ${agent.capabilities.join(", ") || "general"}`,
      [
        "You have a real computer (cloud sandbox when configured) with internet.",
        "http_request: fetch URLs/APIs from the Sora host network.",
        "browser_*: opens and drives the browser on your cloud desktop VM (same screen the user watches / Opens) — the VM has outbound internet.",
        "terminal: runs inside that same VM (curl, scripts, installs).",
        "Do not claim you lack internet or a browser when these tools are available.",
        "Prefer browser_navigate + screenshots for interactive sites; http_request for raw HTML/APIs.",
        "Account setup: use Composio tools for apps the user linked (Gmail, GitHub, Slack, …).",
        "If an app has no Composio connection or needs a custom login (e.g. X without an auth config), open it in the cloud browser and ask the user to Take control to finish sign-in — never ask them to paste passwords into chat.",
      ].join(" "),
      peers.length
        ? [
            "Your teammates (each has their own chat, memory, and computer):",
            ...peers.map((p) => `- ${p}`),
            "Use delegate_task to hand off work, or agent_message to talk to them.",
            "agent_message wakes them immediately by default and returns their reply — use that when the user wants you to talk to another bot now.",
            "Only use deliver=queue for a silent inbox note.",
          ].join("\n")
        : "You are currently the only teammate. The user can add more from the sidebar.",
    ];
    if (/being set up|setup prompt/i.test(agent.instructions)) {
      parts.push(
        [
          "You are mid-setup. Stay in this chat.",
          "Do not call delegate_task.",
          "Ask the prompt’s questions, guide Composio connections, then a supervised analysis-only first run.",
          "After the user is happy with a run, you may schedule_routine (remind them schedules only fire while Sora is open).",
        ].join(" "),
      );
    }
    if (this.tools.list().some((t) => t.name.startsWith("composio_"))) {
      parts.push(
        [
          "Connected apps (Composio) are shared by every teammate on this Sora install.",
          "Always call composio_list_connections before telling the user an app is missing.",
          "If a toolkit shows ACTIVE, it is already linked — use composio_search_tools then composio_execute; do not ask them to connect again.",
          "If inactive or missing, tell them to tap + in the message bar (or Connected apps) and finish browser login once.",
          "Prefer Composio over guessing from the computer when an ACTIVE connection exists.",
          "Never treat those apps as teammates — do not use delegate_task to “connect Gmail” or similar.",
          "Never ask the user to paste app passwords into chat.",
        ].join(" "),
      );
      if (composioStatus) parts.push(composioStatus);
    }
    if (this.tools.list().some((t) => t.name === "schedule_routine")) {
      parts.push(
        [
          "Routines: use schedule_routine after the user approves a first supervised run,",
          "and list_routines to see existing ones.",
          "Tell the user clearly: cron schedules only run while Sora is open on this computer — they do not run in the cloud when the app is closed.",
        ].join(" "),
      );
    }
    if (this.tools.list().some((t) => t.name.startsWith("botdirectory_"))) {
      parts.push(
        [
          "Bot Directory (botdirectory.ai) is an optional catalog of teammate templates.",
          "Use botdirectory_search only when the user asks for templates or curated prompts,",
          "not as a substitute for internet research or real work.",
          "Never invent an email for botdirectory_subscribe_newsletter.",
        ].join(" "),
      );
    }
    if (skill) {
      parts.push(skill.promptFragment);
    }
    if (memories.length) {
      parts.push("Relevant memory:\n- " + memories.join("\n- "));
    }
    if (inbox.length) {
      parts.push("Inbox from other teammates:\n- " + inbox.join("\n- "));
    }
    return parts.join("\n\n");
  }

  async #composioStatusBlurb(): Promise<string | null> {
    if (!this.tools.list().some((t) => t.name.startsWith("composio_"))) {
      return null;
    }
    const now = Date.now();
    // Short cache so a Link in Settings shows up on the next bot turn quickly.
    if (
      this.#composioStatusCache &&
      now - this.#composioStatusCache.at < 15_000
    ) {
      return this.#composioStatusCache.text;
    }
    try {
      const rows = await listComposioConnections(this.runtime.secrets);
      const active = rows.filter((r) => r.status === "ACTIVE");
      const text = active.length
        ? [
            "Current Composio link status for this Sora user (shared by all bots — connect once, every teammate can use it):",
            ...active.map((r) => `- ${r.slug}: ACTIVE`),
            "Treat ACTIVE apps as already connected. Do not ask the user to reconnect them.",
          ].join("\n")
        : "Current Composio link status: no ACTIVE apps yet for this Sora user.";
      this.#composioStatusCache = { at: now, text };
      return text;
    } catch {
      return null;
    }
  }

  #isAlwaysAvailableTool(name: string): boolean {
    return (
      name.startsWith("botdirectory_") ||
      name.startsWith("composio_") ||
      name.startsWith("browser_") ||
      name === "http_request" ||
      name === "agent_message" ||
      name === "delegate_task" ||
      name === "schedule_routine" ||
      name === "list_routines"
    );
  }

  #toolDefinitions(
    agent: Agent,
    skill: SkillInvocation | null,
  ): ChatToolDefinition[] {
    const allowed = new Set(
      skill ? skill.allowedTools : agent.tools.map((t) => t.name),
    );
    if (!skill && agent.tools.some((t) => t.name === "invoke_skill")) {
      allowed.add("invoke_skill");
    }
    for (const tool of this.tools.list()) {
      if (this.#isAlwaysAvailableTool(tool.name)) allowed.add(tool.name);
    }

    const defs: ChatToolDefinition[] = [];
    for (const name of allowed) {
      if (!this.tools.has(name)) continue;
      const onAgent = agent.tools.some((t) => t.name === name);
      if (!onAgent && !this.#isAlwaysAvailableTool(name)) continue;
      if (
        skill &&
        name !== "invoke_skill" &&
        !skill.allowedTools.includes(name) &&
        !this.#isAlwaysAvailableTool(name)
      ) {
        continue;
      }
      const tool = this.tools.get(name);
      defs.push({
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      });
    }
    return defs;
  }

  async #executeTool(
    agent: Agent,
    name: string,
    argsJson: string,
    skill: SkillInvocation | null,
  ) {
    const agentAllowed = new Set(agent.tools.map((t) => t.name));
    if (!agentAllowed.has(name) && !this.#isAlwaysAvailableTool(name)) {
      return {
        ok: false,
        output: "",
        error: `Tool "${name}" is not allowed for agent "${agent.slug}"`,
      };
    }

    if (
      skill &&
      name !== "invoke_skill" &&
      !skill.allowedTools.includes(name) &&
      !this.#isAlwaysAvailableTool(name)
    ) {
      return {
        ok: false,
        output: "",
        error: `Tool "${name}" is not allowed by skill "${skill.skill.id}"`,
      };
    }

    let tool: Tool;
    try {
      tool = this.tools.get(name);
    } catch {
      return {
        ok: false,
        output: "",
        error: `Tool "${name}" is not registered`,
      };
    }

    if (
      name === "delegate_task" &&
      /being set up|setup prompt/i.test(agent.instructions)
    ) {
      return {
        ok: false,
        output: "",
        error:
          "Setup mode: do not use delegate_task. Ask the user in this chat, and tell them to link apps via + / Connected apps (Composio).",
      };
    }

    if (name === "delegate_task" && !this.#delegation) {
      return {
        ok: false,
        output: "",
        error: "Delegation service is not configured on this runner",
      };
    }

    let input: unknown = {};
    try {
      input = argsJson ? JSON.parse(argsJson) : {};
    } catch {
      return {
        ok: false,
        output: "",
        error: `Invalid tool arguments JSON: ${argsJson}`,
      };
    }

    const workspacePath = this.paths.agent(agent.slug).workspace;
    const computer = this.getComputer(agent);

    return tool.execute(input, {
      agentId: agent.id,
      agentSlug: agent.slug,
      workspacePath,
      computer,
      permissions: this.permissions,
      memory: this.memory,
      delegation: this.#delegation ?? undefined,
      agentMessaging: this.inbox
        ? {
            send: async ({ to, message, deliver }) => {
              try {
                const target = this.agents.requireBySlugOrName(to);
                const mode = deliver === "queue" ? "queue" : "run";
                this.inbox!.send({
                  toAgentId: target.id,
                  fromAgentId: agent.id,
                  fromAgentSlug: agent.slug,
                  content: message,
                  deliver: mode,
                });
                if (mode === "queue") {
                  await this.events.emit(
                    "agent.messaged",
                    {
                      from: agent.slug,
                      fromName: agent.name,
                      to: target.slug,
                      toName: target.name,
                      message,
                      deliver: "queue",
                    },
                    "agents",
                  );
                  return {
                    ok: true,
                    output: `Note left for ${target.name}. They will see it on their next run.`,
                    data: { to: target.slug, deliver: "queue" },
                  };
                }

                if (this.#messageDepth >= 3) {
                  return {
                    ok: false,
                    output: "",
                    error: "Teammate message depth limit (3) exceeded",
                  };
                }
                if (
                  this.#messageChain.includes(target.id) ||
                  target.id === agent.id
                ) {
                  return {
                    ok: false,
                    output: "",
                    error: `Message cycle rejected: ${agent.slug} → ${target.slug}`,
                  };
                }

                await this.events.emit(
                  "agent.messaged",
                  {
                    from: agent.slug,
                    fromName: agent.name,
                    to: target.slug,
                    toName: target.name,
                    message,
                    deliver: "run",
                    status: "started",
                  },
                  "agents",
                );

                this.#messageDepth += 1;
                this.#messageChain.push(agent.id);
                let run: RunAgentResult;
                try {
                  run = await this.run({
                    agent: target.slug,
                    prompt: [
                      `Message from teammate ${agent.name} (${agent.slug}):`,
                      message,
                      "",
                      "Reply to that teammate. If they asked you to message the user, do so clearly in your reply.",
                    ].join("\n"),
                  });
                } finally {
                  this.#messageChain.pop();
                  this.#messageDepth -= 1;
                }

                await this.events.emit(
                  "agent.messaged",
                  {
                    from: agent.slug,
                    fromName: agent.name,
                    to: target.slug,
                    toName: target.name,
                    message,
                    reply: run.reply,
                    deliver: "run",
                    status: "completed",
                    conversationId: run.conversationId,
                  },
                  "agents",
                );

                return {
                  ok: true,
                  output: [
                    `Talked to ${target.name}.`,
                    `Their reply:`,
                    run.reply || "(no reply)",
                  ].join("\n"),
                  data: {
                    to: target.slug,
                    deliver: "run",
                    reply: run.reply,
                    conversationId: run.conversationId,
                  },
                };
              } catch (error) {
                return {
                  ok: false,
                  output: "",
                  error:
                    error instanceof Error ? error.message : String(error),
                };
              }
            },
          }
        : undefined,
    });
  }

  async #streamAssistantRound(input: {
    provider: ModelProvider;
    model: string;
    messages: ChatMessage[];
    tools?: ChatToolDefinition[];
    agent: Agent;
    conversationId: string;
  }): Promise<ChatMessage> {
    const streamId = crypto.randomUUID();
    let content = "";
    let assistant: ChatMessage = { role: "assistant", content: null };

    await this.events.emit(
      "agent.text.started",
      {
        agentId: input.agent.id,
        slug: input.agent.slug,
        conversationId: input.conversationId,
        streamId,
      },
      "agents",
    );

    for await (const chunk of input.provider.stream({
      model: input.model,
      messages: input.messages,
      tools: input.tools,
    })) {
      if (chunk.type === "text") {
        content += chunk.text;
        await this.events.emit(
          "agent.text.delta",
          {
            agentId: input.agent.id,
            streamId,
            delta: chunk.text,
          },
          "agents",
        );
      } else if (chunk.type === "done") {
        assistant = chunk.response.message;
        if (!assistant.content && content) {
          assistant = { ...assistant, content };
        }
      }
    }

    await this.events.emit(
      "agent.text.done",
      {
        agentId: input.agent.id,
        streamId,
        content: assistant.content ?? content,
      },
      "agents",
    );

    return assistant;
  }

  async #maybeExtractMemory(
    agent: Agent,
    userPrompt: string,
    reply: string,
  ): Promise<void> {
    const combined = `${userPrompt}\n${reply}`.toLowerCase();
    if (!/\b(remember|memorize|don't forget|note that)\b/.test(combined)) {
      return;
    }
    const content = (reply.trim() || userPrompt.trim()).slice(0, 500);
    if (!content) return;
    const record = await this.memory.save({
      agentId: agent.id,
      kind: "fact",
      content,
    });
    await this.events.emit(
      "memory.saved",
      { agentId: agent.id, memoryId: record.id, content: record.content },
      "memory",
    );
  }
}
