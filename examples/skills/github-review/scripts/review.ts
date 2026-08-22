/**
 * Optional helper script for the github-review skill.
 * Skills primarily run via agent instructions + tools; scripts are available
 * for future workflow/automation hooks without becoming a second runtime.
 */
export function reviewChecklist(): string[] {
  return [
    "List workspace files",
    "Inspect git status when available",
    "Read key source files",
    "Write REVIEW.md with findings",
  ];
}
