import type { Tool, ToolRegistry } from "@sora/tools";
import { composioPlugin } from "./builtins/composio.ts";
import { botdirectoryPlugin } from "./builtins/botdirectory.ts";
import { githubPlugin } from "./builtins/github.ts";
import { mcpPlugin } from "./builtins/mcp.ts";
import type { PluginSecrets, PluginStatus, SoraPlugin } from "./types.ts";

export class PluginRegistry {
  #plugins = new Map<string, SoraPlugin>();

  constructor(plugins: SoraPlugin[] = []) {
    for (const plugin of plugins) this.register(plugin);
  }

  register(plugin: SoraPlugin): void {
    this.#plugins.set(plugin.id, plugin);
  }

  get(id: string): SoraPlugin {
    const plugin = this.#plugins.get(id);
    if (!plugin) throw new Error(`Unknown plugin "${id}"`);
    return plugin;
  }

  list(): SoraPlugin[] {
    return [...this.#plugins.values()];
  }

  statusAll(secrets: PluginSecrets): PluginStatus[] {
    return this.list().map((p) => p.status(secrets));
  }

  /** Collect tools from every configured plugin. */
  collectTools(secrets: PluginSecrets): Tool[] {
    const tools: Tool[] = [];
    for (const plugin of this.list()) {
      tools.push(...plugin.tools(secrets));
    }
    return tools;
  }

  async refreshAll(secrets: PluginSecrets): Promise<void> {
    for (const plugin of this.list()) {
      if (plugin.refresh) await plugin.refresh(secrets);
    }
  }

  /** Register plugin tools onto a ToolRegistry (idempotent by name). */
  applyToToolRegistry(tools: ToolRegistry, secrets: PluginSecrets): void {
    for (const tool of this.collectTools(secrets)) {
      tools.register(tool);
    }
  }
}

export function createDefaultPluginRegistry(): PluginRegistry {
  return new PluginRegistry([
    githubPlugin,
    composioPlugin,
    botdirectoryPlugin,
    mcpPlugin,
  ]);
}
