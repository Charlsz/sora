import type { EventBus, SoraPaths } from "@sora/core";
import type { ConversationStore, MemoryStore } from "@sora/memory";
import type {
  ChatMessage,
  ChatToolDefinition,
  ProviderRegistry,
} from "@sora/models";
import type { Tool, ToolRegistry } from "@sora/tools";
import type { AgentStore } from "./store.ts";
import type { Agent } from "./types.ts";

export type RunAgentInput = {
  agent: string;
  prompt: string;
  conversationId?: string;
  maxToolRounds?: number;
};

export type RunAgentResult = {
  agent: Agent;
  conversationId: string;
  reply: string;
  toolCalls: Array<{ name: string; ok: boolean; output: string }>;
};

export class AgentRunner {
  constructor(
    private readonly agents: AgentStore,
    private readonly providers: ProviderRegistry,
    private readonly tools: ToolRegistry,
    private readonly conversations: ConversationStore,
    private readonly memory: MemoryStore,
    private readonly paths: SoraPaths,
    private readonly events: EventBus,
  ) {}

  async run(input: RunAgentInput): Promise<RunAgentResult> {
    const agent = this.agents.requireBySlugOrName(input.agent);
    const maxToolRounds = input.maxToolRounds ?? 5;

    this.agents.setStatus(agent.id, "running");
    await this.events.emit(
      "agent.started",
      { agentId: agent.id, slug: agent.slug, prompt: input.prompt },
      "agents",
    );

    try {
      const conversation = input.conversationId
        ? await this.conversations.get(input.conversationId)
        : await this.conversations.create(
            agent.id,
            input.prompt.slice(0, 80),
          );

      if (!conversation) {
        throw new Error(`Conversation "${input.conversationId}" not found`);
      }

      await this.conversations.appendMessage(conversation.id, {
        role: "user",
        content: input.prompt,
      });

      const history = await this.conversations.listMessages(conversation.id);
      const longTerm = await this.memory.retrieve({
        agentId: agent.id,
        limit: 5,
      });

      const toolDefs = this.#toolDefinitions(agent);
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: this.#systemPrompt(agent, longTerm.map((m) => m.content)),
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
            await this.events.emit(
              "agent.tool.started",
              {
                agentId: agent.id,
                tool: call.name,
                arguments: call.arguments,
              },
              "agents",
            );

            const result = await this.#executeTool(agent, call.name, call.arguments);
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

      this.agents.setStatus(agent.id, "idle");
      await this.events.emit(
        "agent.completed",
        { agentId: agent.id, slug: agent.slug, reply },
        "agents",
      );

      return {
        agent,
        conversationId: conversation.id,
        reply,
        toolCalls: toolCallLog,
      };
    } catch (error) {
      this.agents.setStatus(agent.id, "error");
      const message = error instanceof Error ? error.message : String(error);
      await this.events.emit(
        "agent.failed",
        { agentId: agent.id, slug: agent.slug, error: message },
        "agents",
      );
      throw error;
    }
  }

  #systemPrompt(agent: Agent, memories: string[]): string {
    const parts = [
      agent.instructions,
      `Agent slug: ${agent.slug}`,
      `Capabilities: ${agent.capabilities.join(", ") || "general"}`,
    ];
    if (memories.length) {
      parts.push("Relevant memory:\n- " + memories.join("\n- "));
    }
    return parts.join("\n\n");
  }

  #toolDefinitions(agent: Agent): ChatToolDefinition[] {
    const defs: ChatToolDefinition[] = [];
    for (const ref of agent.tools) {
      if (!this.tools.has(ref.name)) continue;
      const tool = this.tools.get(ref.name);
      defs.push({
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      });
    }
    return defs;
  }

  async #executeTool(agent: Agent, name: string, argsJson: string) {
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
    return tool.execute(input, {
      agentId: agent.id,
      agentSlug: agent.slug,
      workspacePath,
    });
  }
}
