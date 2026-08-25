import { describe, expect, test } from "bun:test";
import { stepsFromConversation } from "../src/demonstration.ts";
import type { ConversationMessage } from "@sora/memory";

describe("demonstration", () => {
  test("extracts tool steps from assistant metadata", () => {
    const messages: ConversationMessage[] = [
      {
        id: "m1",
        conversationId: "c1",
        role: "user",
        content: "run tools",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "m2",
        conversationId: "c1",
        role: "assistant",
        content: "",
        metadata: {
          toolCalls: [
            { name: "echo", arguments: '{"text":"hi"}' },
            { name: "read_file", arguments: '{"path":"a.txt"}' },
          ],
        },
        createdAt: "2026-01-01T00:00:01.000Z",
      },
    ];
    const steps = stepsFromConversation(messages);
    expect(steps).toEqual([
      { tool: "echo", arguments: { text: "hi" } },
      { tool: "read_file", arguments: { path: "a.txt" } },
    ]);
  });
});
