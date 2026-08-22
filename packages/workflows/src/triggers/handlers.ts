import { cronMatches, nextCronDate } from "../cron.ts";
import type {
  TriggerContext,
  TriggerHandler,
  Workflow,
} from "../types.ts";

export class ManualTriggerHandler implements TriggerHandler {
  readonly type = "manual" as const;

  shouldFire(_workflow: Workflow, context: TriggerContext): boolean {
    return context.payload?.force === true || context.payload?.manual === true;
  }
}

export class CronTriggerHandler implements TriggerHandler {
  readonly type = "cron" as const;

  shouldFire(workflow: Workflow, context: TriggerContext): boolean {
    if (workflow.trigger.type !== "cron") return false;
    if (!workflow.enabled) return false;
    return cronMatches(workflow.trigger.expression, context.now);
  }

  nextRunAt(workflow: Workflow, from: Date): Date | null {
    if (workflow.trigger.type !== "cron") return null;
    return nextCronDate(workflow.trigger.expression, from);
  }
}

export class WebhookTriggerHandler implements TriggerHandler {
  readonly type = "webhook" as const;

  shouldFire(workflow: Workflow, context: TriggerContext): boolean {
    if (workflow.trigger.type !== "webhook") return false;
    const path = context.payload?.path;
    if (typeof path !== "string") return false;
    if (normalizePath(path) !== normalizePath(workflow.trigger.path)) {
      return false;
    }
    if (workflow.trigger.secret) {
      const secret = context.payload?.secret;
      if (secret !== workflow.trigger.secret) return false;
    }
    return true;
  }
}

/** Placeholder — concrete event sources arrive with plugins. */
export class EventTriggerHandler implements TriggerHandler {
  readonly type = "event" as const;

  shouldFire(workflow: Workflow, context: TriggerContext): boolean {
    if (workflow.trigger.type !== "event") return false;
    const source = context.payload?.source;
    const name = context.payload?.name;
    return (
      source === workflow.trigger.source && name === workflow.trigger.name
    );
  }
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function createDefaultTriggerHandlers(): TriggerHandler[] {
  return [
    new ManualTriggerHandler(),
    new CronTriggerHandler(),
    new WebhookTriggerHandler(),
    new EventTriggerHandler(),
  ];
}
