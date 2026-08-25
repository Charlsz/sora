import type { ConversationMessage } from "@sora/memory";
import type { WorkflowStep } from "./types.ts";

/** Extract recorded tool steps from a conversation (teach-by-demonstration). */
export function stepsFromConversation(
  messages: ConversationMessage[],
): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  for (const msg of messages) {
    if (msg.role !== "assistant" || !msg.metadata) continue;
    const toolCalls = (
      msg.metadata as {
        toolCalls?: Array<{ name: string; arguments: string }>;
      }
    ).toolCalls;
    if (!toolCalls?.length) continue;
    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
      } catch {
        args = {};
      }
      steps.push({ tool: call.name, arguments: args });
    }
  }
  return steps;
}
