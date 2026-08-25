export type ToolResult = {
  ok: boolean;
  output: string;
  data?: unknown;
  error?: string;
};

export type ToolContext = {
  agentId: string;
  agentSlug: string;
  workspacePath: string;
  /** Optional computer bound to this agent workspace. */
  computer?: import("@sora/computer").Computer;
  /** Optional permission gate for privileged tools. */
  permissions?: import("@sora/permissions").PermissionGate;
  /** Optional delegation service for agent-to-agent work. */
  delegation?: {
    delegate(input: {
      fromAgentId: string;
      fromAgentSlug: string;
      task: string;
      requiredCapabilities?: string[];
      prefer?: string;
    }): Promise<{
      toAgentSlug: string;
      reply: string;
      toolCalls: Array<{ name: string; ok: boolean; output: string }>;
    }>;
  };
  signal?: AbortSignal;
};

export interface Tool {
  name: string;
  description: string;
  inputSchema: unknown;
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}

export type ToolReference = {
  name: string;
};

export class ToolRegistry {
  #tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.#tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.#tools.delete(name);
  }

  get(name: string): Tool {
    const tool = this.#tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool "${name}"`);
    }
    return tool;
  }

  has(name: string): boolean {
    return this.#tools.has(name);
  }

  list(): Tool[] {
    return [...this.#tools.values()];
  }

  resolveMany(refs: ToolReference[]): Tool[] {
    return refs.map((ref) => this.get(ref.name));
  }
}
