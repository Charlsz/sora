import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
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
    const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
    const content = lastUser?.content ?? "";
    const text = typeof content === "string" ? content : "";

    if (request.tools?.length && /\b(use tool|call tool|tool:)\b/i.test(text)) {
      const tool = request.tools[0]!;
      const toolCall: ToolCall = {
        id: `call_mock_${Date.now()}`,
        name: tool.name,
        arguments: JSON.stringify({ input: text }),
      };
      return {
        message: {
          role: "assistant",
          content: null,
          toolCalls: [toolCall],
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
