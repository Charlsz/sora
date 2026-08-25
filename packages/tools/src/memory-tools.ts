import type { MemoryStore } from "@sora/memory";
import type { Tool, ToolContext, ToolResult } from "./types.ts";

/** Persist a note or fact into the agent's long-term memory. */
export const saveMemoryTool: Tool = {
  name: "save_memory",
  description:
    "Save a fact or note to this agent's long-term memory for future conversations.",
  inputSchema: {
    type: "object",
    properties: {
      content: { type: "string", description: "What to remember" },
      kind: {
        type: "string",
        description: "Memory kind: note, fact, preference (default note)",
      },
    },
    required: ["content"],
  },
  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const memory = context.memory;
    if (!memory) {
      return {
        ok: false,
        output: "",
        error: "Memory store is not available",
      };
    }
    const data = (input ?? {}) as { content?: string; kind?: string };
    const content = data.content?.trim();
    if (!content) {
      return { ok: false, output: "", error: "content is required" };
    }
    const kind = (data.kind?.trim() || "note") as
      | "note"
      | "fact"
      | "preference";
    const record = await memory.save({
      agentId: context.agentId,
      content: content.slice(0, 4000),
      kind,
    });
    return {
      ok: true,
      output: `Saved memory ${record.id}`,
      data: { id: record.id, kind: record.kind },
    };
  },
};

export const searchMemoryTool: Tool = {
  name: "search_memory",
  description: "Search this agent's long-term memory by keyword.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search terms" },
      limit: { type: "number", description: "Max results (default 10)" },
    },
    required: ["query"],
  },
  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const memory = context.memory;
    if (!memory) {
      return {
        ok: false,
        output: "",
        error: "Memory store is not available",
      };
    }
    const data = (input ?? {}) as { query?: string; limit?: number };
    const query = data.query?.trim();
    if (!query) {
      return { ok: false, output: "", error: "query is required" };
    }
    const hits = await memory.search({
      agentId: context.agentId,
      query,
      limit: data.limit ?? 10,
    });
    if (!hits.length) {
      return { ok: true, output: "(no matching memories)" };
    }
    const lines = hits.map(
      (m) => `[${m.kind}] ${m.content.slice(0, 300)} (${m.id})`,
    );
    return { ok: true, output: lines.join("\n"), data: hits };
  },
};

export type MemoryToolContext = ToolContext & { memory?: MemoryStore };
