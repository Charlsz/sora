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
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly defaultHeaders: Record<string, string>;

  constructor(options: OpenAICompatibleOptions = {}) {
    this.id = options.id ?? "openai";
    this.apiKey =
      options.apiKey ??
      process.env.OPENAI_API_KEY ??
      process.env.SORA_API_KEY ??
      "";
    this.baseUrl = (
      options.baseUrl ??
      process.env.OPENAI_BASE_URL ??
      "https://api.openai.com/v1"
    ).replace(/\/$/, "");
    this.defaultHeaders = options.defaultHeaders ?? {};
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const body = this.#toRequestBody(request);
    const json = await this.#post("/chat/completions", body);
    return this.#fromResponse(json);
  }

  async *stream(request: ChatRequest): AsyncIterable<StreamChunk> {
    // Phase 1: non-streaming under the hood; keep the async iterable API stable.
    const response = await this.chat(request);
    const text = response.message.content ?? "";
    if (text) yield { type: "text", text };
    if (response.message.toolCalls) {
      for (const toolCall of response.message.toolCalls) {
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
    if (!this.apiKey && !this.baseUrl.includes("localhost") && !this.baseUrl.includes("127.0.0.1")) {
      throw new Error(
        `Provider "${this.id}" requires an API key. Set OPENAI_API_KEY or use mock:echo.`,
      );
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...this.defaultHeaders,
    };
    if (this.apiKey) {
      headers.authorization = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Model provider error (${res.status}): ${errText}`);
    }

    return res.json();
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
