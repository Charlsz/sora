import type { EventBus, SoraPaths } from "@sora/core";
import { ComputerRegistry, LocalComputer } from "@sora/computer";
import type { ConversationStore, MemoryStore } from "@sora/memory";
import type {
  ChatMessage,
  ChatToolDefinition,
  ProviderRegistry,
} from "@sora/models";
import type { PermissionGate } from "@sora/permissions";
import {
  parseSkillSlashCommand,
  type SkillInvocation,
  type SkillRegistry,
} from "@sora/skills";
import type { Tool, ToolRegistry } from "@sora/tools";
import { join } from "node:path";
import type { DelegationService } from "./delegation.ts";
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
  ) {}

  setDelegation(delegation: DelegationService): void {
    this.#delegation = delegation;
  }

  setSkills(skills: SkillRegistry): void {
    this.#skills = skills;
  }

  /** Reuse the same LocalComputer (and browser session) for an agent. */
  getComputer(agent: Agent): LocalComputer {
    const id = `agent:${agent.slug}`;
    return this.computers.getOrCreate(id, () => {
      const workspacePath = this.paths.agent(agent.slug).workspace;
      const profileDir = join(
        this.paths.agent(agent.slug).root,
        "browser-profile",
      );
      return new LocalComputer({
        id,
        workspaceRoot: workspacePath,
        browserProfileDir: profileDir,
      });
    }) as LocalComputer;
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
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: this.#systemPrompt(
            agent,
            longTerm.map((m) => m.content),
            skillInvocation,
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

      const { provider, model } = this.providers.resolve(agent.model);
      const toolCallLog: RunAgentResult["toolCalls"] = [];
      let reply = "";
      let activeSkill = skillInvocation;

      for (let round = 0; round <= maxToolRounds; round++) {
        const response = await provider.chat({
          model,
          messages,
          tools: toolDefs.length ? toolDefs : undefined,
        });

        const assistant = response.message;
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
            toolCallLog.push({
              name: call.name,
              ok: result.ok,
              output: result.output,
            });

            await this.events.emit(
              result.ok ? "agent.tool.completed" : "agent.tool.failed",
              {
                agentId: agent.id,
                tool: call.name,
                ok: result.ok,
                output: result.output,
                error: result.error,
                skill: activeSkill?.skill.id,
              },
              "agents",
            );

            const toolContent = result.ok
              ? result.output
              : `Error: ${result.error ?? "tool failed"}`;

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
      await this.events.emit(
        "agent.completed",
        {
          agentId: agent.id,
          slug: agent.slug,
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
  ): string {
    const workspace = this.paths.agent(agent.slug).workspace;
    const parts = [
      agent.instructions,
      `Agent slug: ${agent.slug}`,
      `Workspace: ${workspace}`,
      `Capabilities: ${agent.capabilities.join(", ") || "general"}`,
      "Filesystem tools are confined to your workspace.",
      "Terminal commands run with workspace cwd and best-effort path guards; do not attempt to escape the workspace.",
    ];
    if (skill) {
      parts.push(skill.promptFragment);
    }
    if (memories.length) {
      parts.push("Relevant memory:\n- " + memories.join("\n- "));
    }
    return parts.join("\n\n");
  }

  #toolDefinitions(
    agent: Agent,
    skill: SkillInvocation | null,
  ): ChatToolDefinition[] {
    const allowed = new Set(
      skill ? skill.allowedTools : agent.tools.map((t) => t.name),
    );
    // When no skill is active, keep invoke_skill available if the agent has it
    if (!skill && agent.tools.some((t) => t.name === "invoke_skill")) {
      allowed.add("invoke_skill");
    }

    const defs: ChatToolDefinition[] = [];
    for (const name of allowed) {
      if (!this.tools.has(name)) continue;
      // Agent must still list the tool (except we already filtered via skill ∩ agent)
      if (!agent.tools.some((t) => t.name === name)) continue;
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
    if (!agentAllowed.has(name)) {
      return {
        ok: false,
        output: "",
        error: `Tool "${name}" is not allowed for agent "${agent.slug}"`,
      };
    }

    if (skill && name !== "invoke_skill" && !skill.allowedTools.includes(name)) {
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
      delegation: this.#delegation ?? undefined,
    });
  }
}
