import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatToolDefinition,
  ModelProvider,
  StreamChunk,
  ToolCall,
} from "./types.ts";

/**
 * Offline-capable provider for tests and local demos.
 * Understands a few simple patterns and otherwise echoes the last user message.
 */
export class MockProvider implements ModelProvider {
  readonly id = "mock";

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const last = request.messages[request.messages.length - 1];
    const system = request.messages.find((m) => m.role === "system")?.content ?? "";
    const skillActive =
      typeof system === "string" && /## Active skill:/i.test(system);

    // After tools run during a skill, finish with a summary (or next skill step).
    if (last?.role === "tool") {
      const nextSkillTool = this.#nextSkillToolCall(
        system,
        request.messages,
        request.tools ?? [],
      );
      if (nextSkillTool) {
        return {
          message: {
            role: "assistant",
            content: null,
            toolCalls: [nextSkillTool],
          },
          finishReason: "tool_calls",
        };
      }

      const toolNotes = request.messages
        .filter((m) => m.role === "tool")
        .map((m) => `- ${m.name ?? "tool"}: ${m.content ?? ""}`)
        .join("\n");
      return {
        message: {
          role: "assistant",
          content: `Completed with tools:\n${toolNotes}`,
        },
        finishReason: "stop",
      };
    }

    const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
    const content = lastUser?.content ?? "";
    const text = typeof content === "string" ? content : "";

    const planned = this.#planToolCall(text, request.tools ?? [], skillActive, system);
    if (planned) {
      return {
        message: {
          role: "assistant",
          content: null,
          toolCalls: [planned],
        },
        finishReason: "tool_calls",
      };
    }

    const reply = this.#composeReply(text, request.messages);
    return {
      message: { role: "assistant", content: reply },
      finishReason: "stop",
    };
  }

  async *stream(request: ChatRequest): AsyncIterable<StreamChunk> {
    const response = await this.chat(request);
    const text = response.message.content ?? "";
    if (text) {
      const parts = text.split(/(\s+)/);
      for (const part of parts) {
        if (part) yield { type: "text", text: part };
      }
    }
    if (response.message.toolCalls) {
      for (const toolCall of response.message.toolCalls) {
        yield { type: "tool_call", toolCall };
      }
    }
    yield { type: "done", response };
  }

  #nextSkillToolCall(
    system: string | null,
    messages: ChatMessage[],
    tools: ChatToolDefinition[],
  ): ToolCall | null {
    if (!system || !/## Active skill:/i.test(system)) return null;
    const available = new Set(tools.map((t) => t.name));
    const toolNames = messages.filter((m) => m.role === "tool").map((m) => m.name);
    const id = () => `call_mock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (
      /Active skill:\s*github-review/i.test(system) &&
      available.has("write_file") &&
      !toolNames.includes("write_file")
    ) {
      const listing =
        messages.find((m) => m.role === "tool" && m.name === "list_dir")?.content ??
        "(workspace)";
      const content = [
        "# Workspace Review",
        "",
        "## Summary",
        "Automated local review via the github-review skill.",
        "",
        "## Layout observed",
        "```",
        listing,
        "```",
        "",
        "## Strengths",
        "- Workspace is accessible to the agent skill path.",
        "",
        "## Risks / bugs",
        "- Review is based on listing + skill instructions; deepen with more file reads as needed.",
        "",
        "## Suggested next steps",
        "- Expand coverage on critical modules.",
        "- Re-run after substantive changes.",
        "",
      ].join("\n");
      return {
        id: id(),
        name: "write_file",
        arguments: JSON.stringify({ path: "REVIEW.md", content }),
      };
    }
    return null;
  }

  #planToolCall(
    text: string,
    tools: ChatToolDefinition[],
    skillActive: boolean,
    system: string | null,
  ): ToolCall | null {
    if (!tools.length) return null;
    const available = new Set(tools.map((t) => t.name));
    const id = () => `call_mock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const skillUse =
      /(?:use|run|invoke)\s+skill\s+[`"']?([a-zA-Z][\w-]*)[`"']?/i.exec(text);
    if (skillUse && available.has("invoke_skill")) {
      return {
        id: id(),
        name: "invoke_skill",
        arguments: JSON.stringify({ name: skillUse[1], task: text }),
      };
    }

    if (
      skillActive &&
      /Active skill:\s*github-review/i.test(system ?? "") &&
      available.has("list_dir")
    ) {
      return {
        id: id(),
        name: "list_dir",
        arguments: JSON.stringify({ path: "." }),
      };
    }

    const askMatch =
      /(?:ask|tell|have)\s+([A-Za-z][\w-]*)\s+to\s+([\s\S]+)$/i.exec(text.trim()) ||
      /delegate\s+(?:to\s+)?([A-Za-z][\w-]*)[:\s]+([\s\S]+)$/i.exec(text.trim());
    if (askMatch && available.has("delegate_task")) {
      return {
        id: id(),
        name: "delegate_task",
        arguments: JSON.stringify({
          prefer: askMatch[1],
          task: askMatch[2]!.trim(),
        }),
      };
    }

    if (
      available.has("write_file") &&
      /\b(hello\s*world|bun\s+server|http\s+server)\b/i.test(text)
    ) {
      const content = [
        "const server = Bun.serve({",
        "  port: 3000,",
        "  fetch() {",
        '    return new Response("Hello from Sora");',
        "  },",
        "});",
        "",
        'console.log(`Listening on http://localhost:${server.port}`);',
        "",
      ].join("\n");
      return {
        id: id(),
        name: "write_file",
        arguments: JSON.stringify({
          path: "server.ts",
          content,
        }),
      };
    }

    const writeMatch =
      /(?:write|create)\s+(?:a\s+)?file\s+(?:named\s+|called\s+)?[`"']?([^\s`"']+)[`"']?\s+(?:with|containing)\s+(?:content\s+)?([\s\S]+)$/i.exec(
        text.trim(),
      );
    if (writeMatch && available.has("write_file")) {
      return {
        id: id(),
        name: "write_file",
        arguments: JSON.stringify({
          path: writeMatch[1],
          content: writeMatch[2]!.trim(),
        }),
      };
    }

    const readMatch =
      /(?:read|open)\s+(?:the\s+)?file\s+[`"']?([^\s`"']+)[`"']?/i.exec(text);
    if (readMatch && available.has("read_file")) {
      return {
        id: id(),
        name: "read_file",
        arguments: JSON.stringify({ path: readMatch[1] }),
      };
    }

    if (
      /\b(list\s+(files|dir|directory)|inspect\s+workspace|review)\b/i.test(text) &&
      available.has("list_dir")
    ) {
      return {
        id: id(),
        name: "list_dir",
        arguments: JSON.stringify({ path: "." }),
      };
    }

    const runMatch =
      /(?:run|execute)\s+(?:command\s+)?[`"'](.+?)[`"']\s*$/i.exec(text.trim()) ||
      /(?:run|execute)\s+(.+)$/i.exec(text.trim());
    if (
      runMatch &&
      available.has("terminal") &&
      /\b(run|execute|terminal|shell)\b/i.test(text)
    ) {
      return {
        id: id(),
        name: "terminal",
        arguments: JSON.stringify({ command: runMatch[1]!.trim() }),
      };
    }

    if (/\b(use tool|call tool|tool:)\b/i.test(text)) {
      const tool = tools[0]!;
      return {
        id: id(),
        name: tool.name,
        arguments: JSON.stringify({ input: text }),
      };
    }

    return null;
  }

  #composeReply(userText: string, messages: ChatMessage[]): string {
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const nameMatch =
      typeof system === "string" ? /You are ([^.]+)\./i.exec(system) : null;
    const agentName = nameMatch?.[1]?.trim() ?? "Agent";

    if (!userText.trim()) {
      return `${agentName}: Ready. Send me a task.`;
    }

    if (/^hello\b/i.test(userText.trim())) {
      return `${agentName}: Hello! I'm online via the mock model provider.`;
    }

    return `${agentName}: Acknowledged — "${userText.trim()}"`;
  }
}
