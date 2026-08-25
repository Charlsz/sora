export type WorkflowStep = {
  tool: string;
  arguments: Record<string, unknown>;
};

export type WorkflowSource = "demonstration" | "manual";

export type TriggerType = "manual" | "cron" | "webhook" | "event";

export type ManualTrigger = {
  type: "manual";
};

export type CronTrigger = {
  type: "cron";
  /** Standard 5-field cron: minute hour day-of-month month day-of-week */
  expression: string;
};

export type WebhookTrigger = {
  type: "webhook";
  /** Path segment under /webhooks/:path */
  path: string;
  secret?: string;
};

/** Reserved for future GitHub/Slack/filesystem integrations. */
export type EventTrigger = {
  type: "event";
  source: string;
  name: string;
};

export type WorkflowTrigger =
  | ManualTrigger
  | CronTrigger
  | WebhookTrigger
  | EventTrigger;

export type Workflow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  agentSlug: string;
  skill?: string;
  task: string;
  steps?: WorkflowStep[];
  source?: WorkflowSource;
  trigger: WorkflowTrigger;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateWorkflowInput = {
  name: string;
  description?: string;
  agent: string;
  skill?: string;
  task: string;
  trigger: WorkflowTrigger;
  slug?: string;
  enabled?: boolean;
  steps?: WorkflowStep[];
  source?: WorkflowSource;
};

export type WorkflowRunStatus =
  | "running"
  | "completed"
  | "failed";

export type WorkflowRun = {
  id: string;
  workflowId: string;
  status: WorkflowRunStatus;
  triggerType: TriggerType;
  triggerPayload?: Record<string, unknown>;
  reply?: string;
  error?: string;
  conversationId?: string;
  startedAt: string;
  finishedAt?: string;
};

/**
 * Port into the agent runtime. Workflows never bypass this.
 */
export type WorkflowExecutor = {
  run(input: {
    agent: string;
    prompt: string;
    skill?: string;
  }): Promise<{
    reply: string;
    conversationId: string;
    toolCalls: Array<{ name: string; ok: boolean; output: string }>;
  }>;
};

/** Direct tool execution for demonstration replay (no LLM). */
export type WorkflowToolExecutor = {
  execute(input: {
    agentSlug: string;
    tool: string;
    arguments: Record<string, unknown>;
  }): Promise<{ ok: boolean; output: string; error?: string }>;
};

export type TriggerContext = {
  now: Date;
  payload?: Record<string, unknown>;
};

export interface TriggerHandler {
  readonly type: TriggerType;
  /** Whether this trigger should fire for the given workflow right now. */
  shouldFire(workflow: Workflow, context: TriggerContext): boolean;
  /** Optional: compute next scheduled time (cron). */
  nextRunAt?(workflow: Workflow, from: Date): Date | null;
}
