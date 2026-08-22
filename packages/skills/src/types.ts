export type Skill = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  tools: string[];
  /** Absolute path to the skill directory. */
  path: string;
  version?: string;
  tags?: string[];
};

export type SkillManifest = {
  name: string;
  description: string;
  version?: string;
  tools: string[];
  tags?: string[];
};

export type SkillReference = {
  name: string;
};

export type SkillInvocation = {
  skill: Skill;
  /** Tools the agent may use while running this skill (intersection). */
  allowedTools: string[];
  /** Extra system prompt fragment. */
  promptFragment: string;
};
