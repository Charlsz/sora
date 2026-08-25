import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatToolDefinition,
  ModelProvider,
  StreamChunk,
  ToolCall,
} from "./types.ts";

export type OpenAICompatibleOptions = {
  id?: string;
  apiKey?: string;
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
};

type OpenAIMessage = {
  role: string;
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

/**
 * OpenAI Chat Completions transport.
 * Works with OpenAI, OpenRouter, Ollama OpenAI mode, and other compatible endpoints.
 */
export class OpenAICompatibleProvider implements ModelProvider {
  readonly id: string;
  #apiKey: string;
  #baseUrl: string;
  readonly defaultHeaders: Record<string, string>;

  constructor(options: OpenAICompatibleOptions = {}) {
    this.id = options.id ?? "openai";
    this.#apiKey =
      options.apiKey ??
      process.env.OPENAI_API_KEY ??
      process.env.SORA_API_KEY ??
      "";
    this.#baseUrl = (
      options.baseUrl ??
      process.env.OPENAI_BASE_URL ??
      "https://api.openai.com/v1"
    ).replace(/\/$/, "");
    this.defaultHeaders = options.defaultHeaders ?? {};
  }

  get apiKey(): string {
    return this.#apiKey;
  }

  get baseUrl(): string {
    return this.#baseUrl;
  }

  /** Hot-reload credentials from ~/.sora/secrets.json without restarting. */
  configure(options: { apiKey?: string; baseUrl?: string }): void {
    if (options.apiKey !== undefined) this.#apiKey = options.apiKey;
    if (options.baseUrl !== undefined) {
      this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const body = this.#toRequestBody(request);
    const json = await this.#post("/chat/completions", body);
    return this.#fromResponse(json);
  }

  async *stream(request: ChatRequest): AsyncIterable<StreamChunk> {
    const body = { ...this.#toRequestBody(request), stream: true };
    const res = await this.#postStream("/chat/completions", body);
    if (!res.body) {
      throw new Error("Model provider returned no stream body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    const toolCalls = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let finishReason: ChatResponse["finishReason"] = "stop";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let lineBreak = buffer.indexOf("\n");
      while (lineBreak >= 0) {
        const line = buffer.slice(0, lineBreak).trim();
        buffer = buffer.slice(lineBreak + 1);
        lineBreak = buffer.indexOf("\n");

        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        let json: any;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }

        const choice = json.choices?.[0];
        const delta = choice?.delta;
        if (!delta) continue;

        if (typeof delta.content === "string" && delta.content) {
          content += delta.content;
          yield { type: "text", text: delta.content };
        }

        if (delta.tool_calls?.length) {
          for (const tc of delta.tool_calls) {
            const index = tc.index ?? 0;
            let entry = toolCalls.get(index);
            if (!entry) {
              entry = {
                id: tc.id ?? "",
                name: tc.function?.name ?? "",
                arguments: "",
              };
              toolCalls.set(index, entry);
            }
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name = tc.function.name;
            if (tc.function?.arguments) {
              entry.arguments += tc.function.arguments;
            }
          }
        }

        if (choice.finish_reason === "tool_calls") {
          finishReason = "tool_calls";
        } else if (choice.finish_reason === "length") {
          finishReason = "length";
        } else if (choice.finish_reason === "stop") {
          finishReason = "stop";
        }
      }
    }

    const toolCallList: ToolCall[] = [...toolCalls.values()]
      .filter((tc) => tc.id && tc.name)
      .map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments || "{}",
      }));

    const response: ChatResponse = {
      message: {
        role: "assistant",
        content: content || null,
        toolCalls: toolCallList.length ? toolCallList : undefined,
      },
      finishReason: toolCallList.length ? "tool_calls" : finishReason,
    };

    if (toolCallList.length) {
      for (const toolCall of toolCallList) {
        yield { type: "tool_call", toolCall };
      }
    }

    yield { type: "done", response };
  }

  #toRequestBody(request: ChatRequest): Record<string, unknown> {
    return {
      model: request.model,
      messages: request.messages.map(toOpenAIMessage),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      tools: request.tools?.map(toOpenAITool),
    };
  }

  async #post(path: string, body: Record<string, unknown>): Promise<any> {
    const res = await this.#fetch(path, body, false);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Model provider error (${res.status}): ${errText}`);
    }
    return res.json();
  }

  async #postStream(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    const res = await this.#fetch(path, body, true);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Model provider error (${res.status}): ${errText}`);
    }
    return res;
  }

  async #fetch(
    path: string,
    body: Record<string, unknown>,
    stream: boolean,
  ): Promise<Response> {
    if (
      !this.#apiKey &&
      !this.#baseUrl.includes("localhost") &&
      !this.#baseUrl.includes("127.0.0.1")
    ) {
      throw new Error(
        `Provider "${this.id}" requires an API key. Connect it in Settings or set OPENAI_API_KEY / use mock:echo.`,
      );
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...this.defaultHeaders,
    };
    if (this.#apiKey) {
      headers.authorization = `Bearer ${this.#apiKey}`;
    }
    if (stream) {
      headers.accept = "text/event-stream";
    }

    return fetch(`${this.#baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  #fromResponse(json: any): ChatResponse {
    const choice = json.choices?.[0];
    const message = choice?.message;
    if (!message) {
      throw new Error("Model provider returned no choices");
    }

    const toolCalls: ToolCall[] | undefined = message.tool_calls?.map(
      (tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments ?? "{}",
      }),
    );

    const finish =
      choice.finish_reason === "tool_calls"
        ? "tool_calls"
        : choice.finish_reason === "length"
          ? "length"
          : "stop";

    return {
      message: {
        role: "assistant",
        content: message.content ?? null,
        toolCalls,
      },
      finishReason: finish,
      usage: json.usage
        ? {
            promptTokens: json.usage.prompt_tokens,
            completionTokens: json.usage.completion_tokens,
            totalTokens: json.usage.total_tokens,
          }
        : undefined,
    };
  }
}

function toOpenAIMessage(message: ChatMessage): OpenAIMessage {
  const out: OpenAIMessage = {
    role: message.role,
    content: message.content,
  };
  if (message.name) out.name = message.name;
  if (message.toolCallId) out.tool_call_id = message.toolCallId;
  if (message.toolCalls?.length) {
    out.tool_calls = message.toolCalls.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: { name: tc.name, arguments: tc.arguments },
    }));
  }
  return out;
}

function toOpenAITool(tool: ChatToolDefinition) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters ?? { type: "object", properties: {} },
    },
  };
}
