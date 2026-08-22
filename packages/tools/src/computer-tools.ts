import type { Tool, ToolContext, ToolResult } from "./types.ts";

function requireComputer(context: ToolContext) {
  if (!context.computer) {
    throw new Error("No computer bound to this agent context");
  }
  return context.computer;
}

async function requirePermission(
  context: ToolContext,
  action: import("@sora/permissions").PermissionAction,
  resource: string,
  detail?: Record<string, unknown>,
) {
  if (!context.permissions) return;
  await context.permissions.assert({
    agentId: context.agentId,
    agentSlug: context.agentSlug,
    action,
    resource,
    detail,
  });
}

export const readFileTool: Tool = {
  name: "read_file",
  description: "Read a UTF-8 text file from the agent workspace.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path relative to workspace root" },
    },
    required: ["path"],
  },
  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const { path } = (input ?? {}) as { path?: string };
    if (!path) return { ok: false, output: "", error: "path is required" };
    try {
      await requirePermission(context, "fs.read", path);
      const content = await requireComputer(context).filesystem.readFile(path);
      return { ok: true, output: content, data: { path, bytes: content.length } };
    } catch (error) {
      return {
        ok: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

export const writeFileTool: Tool = {
  name: "write_file",
  description: "Write a UTF-8 text file inside the agent workspace.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
  },
  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const data = (input ?? {}) as { path?: string; content?: string };
    if (!data.path || data.content === undefined) {
      return { ok: false, output: "", error: "path and content are required" };
    }
    try {
      await requirePermission(context, "fs.write", data.path, {
        bytes: data.content.length,
      });
      await requireComputer(context).filesystem.writeFile(data.path, data.content);
      return {
        ok: true,
        output: `Wrote ${data.content.length} bytes to ${data.path}`,
        data: { path: data.path },
      };
    } catch (error) {
      return {
        ok: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

export const listDirTool: Tool = {
  name: "list_dir",
  description: "List files and directories in the agent workspace.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Directory relative to workspace (default: .)",
      },
    },
  },
  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const data = (input ?? {}) as { path?: string };
    const path = data.path ?? ".";
    try {
      await requirePermission(context, "fs.read", path);
      const entries = await requireComputer(context).filesystem.listDir(path);
      return {
        ok: true,
        output: entries.join("\n") || "(empty)",
        data: { path, entries },
      };
    } catch (error) {
      return {
        ok: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

export const deleteFileTool: Tool = {
  name: "delete_file",
  description: "Delete a file or directory inside the agent workspace.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
    },
    required: ["path"],
  },
  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const data = (input ?? {}) as { path?: string };
    if (!data.path) return { ok: false, output: "", error: "path is required" };
    try {
      await requirePermission(context, "fs.delete", data.path);
      await requireComputer(context).filesystem.remove(data.path);
      return { ok: true, output: `Deleted ${data.path}`, data: { path: data.path } };
    } catch (error) {
      return {
        ok: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

export const terminalTool: Tool = {
  name: "terminal",
  description:
    "Run a shell command inside the agent workspace. Working directory is the workspace root unless cwd is set.",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string" },
      cwd: { type: "string", description: "Optional relative working directory" },
    },
    required: ["command"],
  },
  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const data = (input ?? {}) as { command?: string; cwd?: string };
    if (!data.command) {
      return { ok: false, output: "", error: "command is required" };
    }
    try {
      await requirePermission(context, "terminal.exec", data.command, {
        cwd: data.cwd,
      });
      const result = await requireComputer(context).terminal.exec(data.command, {
        cwd: data.cwd,
      });
      const output = [
        result.stdout,
        result.stderr ? `stderr:\n${result.stderr}` : "",
        `exit_code: ${result.exitCode}`,
      ]
        .filter(Boolean)
        .join("\n");
      return {
        ok: result.exitCode === 0,
        output,
        data: result,
        error: result.exitCode === 0 ? undefined : `exit code ${result.exitCode}`,
      };
    } catch (error) {
      return {
        ok: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
