export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ChatMessage = {
  role: ChatRole;
  content: string | null;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
};

export type ChatToolDefinition = {
  name: string;
  description: string;
  parameters: unknown;
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  temperature?: number;
  maxTokens?: number;
};

export type ChatResponse = {
  message: ChatMessage;
  finishReason: "stop" | "tool_calls" | "length" | "error";
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "done"; response: ChatResponse };

export interface ModelProvider {
  readonly id: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
  stream(request: ChatRequest): AsyncIterable<StreamChunk>;
}

export type ModelReference = {
  provider: string;
  model: string;
  raw: string;
};

/** Parse `provider:model` references. Model may contain additional colons. */
export function parseModelReference(raw: string): ModelReference {
  const trimmed = raw.trim();
  const idx = trimmed.indexOf(":");
  if (idx <= 0 || idx === trimmed.length - 1) {
    throw new Error(
      `Invalid model reference "${raw}". Expected format: provider:model (e.g. openai:gpt-4o-mini)`,
    );
  }
  return {
    provider: trimmed.slice(0, idx),
    model: trimmed.slice(idx + 1),
    raw: trimmed,
  };
}
