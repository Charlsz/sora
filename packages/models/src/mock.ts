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

    // After tools run, produce a final natural-language summary.
    if (last?.role === "tool") {
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

    const planned = this.#planToolCall(text, request.tools ?? []);
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
      yield { type: "text", text };
    }
    if (response.message.toolCalls) {
      for (const toolCall of response.message.toolCalls) {
        yield { type: "tool_call", toolCall };
      }
    }
    yield { type: "done", response };
  }

  #planToolCall(
    text: string,
    tools: ChatToolDefinition[],
  ): ToolCall | null {
    if (!tools.length) return null;
    const available = new Set(tools.map((t) => t.name));
    const id = () => `call_mock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

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

    // Milestone-style coding tasks for engineering agents
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

    if (/\b(list\s+(files|dir|directory)|inspect\s+workspace)\b/i.test(text) && available.has("list_dir")) {
      return {
        id: id(),
        name: "list_dir",
        arguments: JSON.stringify({ path: "." }),
      };
    }

    const runMatch =
      /(?:run|execute)\s+(?:command\s+)?[`"'](.+?)[`"']\s*$/i.exec(text.trim()) ||
      /(?:run|execute)\s+(.+)$/i.exec(text.trim());
    if (runMatch && available.has("terminal") && /\b(run|execute|terminal|shell)\b/i.test(text)) {
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
    const nameMatch = typeof system === "string" ? /You are ([^.]+)\./i.exec(system) : null;
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
