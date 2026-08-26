import type { Tool, ToolResult } from "@sora/tools";
import type { WorkflowStore } from "@sora/workflows";

/**
 * Let teammates save recurring/on-demand routines.
 * Cron only fires while the local Sora process is running.
 */
export function createScheduleTools(workflows: WorkflowStore): Tool[] {
  const scheduleRoutine: Tool = {
    name: "schedule_routine",
    description:
      "Save a named routine for this teammate (weekly check-in, daily digest, etc.). " +
      "Use after the user approves the first supervised run. " +
      "Optional cron (5-field, e.g. 0 9 * * 1 for Mondays 9:00). " +
      "Important: schedules only run while Sora is open on this computer — they do not fire in the cloud when the app is closed.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Short routine name, e.g. Weekly happiness check-in",
        },
        task: {
          type: "string",
          description:
            "Prompt to run each time (include the teammate’s job and guardrails)",
        },
        cron: {
          type: "string",
          description:
            "Optional 5-field cron. Omit for on-demand / manual only.",
        },
        enabled: {
          type: "boolean",
          description: "Default true",
        },
      },
      required: ["name", "task"],
    },
    async execute(input, context): Promise<ToolResult> {
      const data = (input ?? {}) as {
        name?: string;
        task?: string;
        cron?: string;
        enabled?: boolean;
      };
      const name = data.name?.trim() ?? "";
      const task = data.task?.trim() ?? "";
      if (!name || !task) {
        return {
          ok: false,
          output: "",
          error: "name and task are required",
        };
      }
      try {
        const cron = data.cron?.trim();
        const workflow = workflows.create({
          name,
          agent: context.agentSlug,
          task,
          enabled: data.enabled !== false,
          trigger: cron
            ? { type: "cron", expression: cron }
            : { type: "manual" },
          source: "agent",
        });
        const when = cron
          ? `cron “${cron}” (only while Sora is running on this PC)`
          : "manual / on-demand (run from Schedules)";
        return {
          ok: true,
          output: `Saved routine “${workflow.name}” (${workflow.slug}) · ${when}`,
          data: {
            slug: workflow.slug,
            cron: cron ?? null,
            localOnly: true,
          },
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

  const listRoutines: Tool = {
    name: "list_routines",
    description:
      "List saved routines for this teammate (or all). Reminds that cron needs Sora running locally.",
    inputSchema: {
      type: "object",
      properties: {
        mineOnly: {
          type: "boolean",
          description: "If true (default), only this teammate’s routines",
        },
      },
    },
    async execute(input, context): Promise<ToolResult> {
      const mineOnly = (input as { mineOnly?: boolean })?.mineOnly !== false;
      const rows = workflows
        .list()
        .filter((w) => !mineOnly || w.agentSlug === context.agentSlug);
      if (!rows.length) {
        return {
          ok: true,
          output:
            "(no routines yet) · Schedules only run while Sora is open on this computer.",
        };
      }
      const lines = rows.map((w) => {
        const trig =
          w.trigger.type === "cron"
            ? `cron ${w.trigger.expression}`
            : w.trigger.type;
        return `${w.name} (${w.slug}) · ${trig} · ${w.enabled ? "on" : "paused"} · agent ${w.agentSlug}`;
      });
      lines.push(
        "Note: cron fires only while Sora is running locally — not when the app is closed.",
      );
      return { ok: true, output: lines.join("\n"), data: rows };
    },
  };

  return [scheduleRoutine, listRoutines];
}
