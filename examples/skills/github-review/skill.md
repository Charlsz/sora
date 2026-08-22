# GitHub Review (local)

Perform a practical review of the **current agent workspace** as if preparing PR feedback.

GitHub API integration is not required. Operate on local files and `git` when available.

## Steps

1. Use `list_dir` on `.` to see the workspace layout.
2. Use `terminal` with a safe relative command such as `git status` or `git log -5 --oneline` when helpful. Do not use absolute paths or `..`.
3. Read the most important source files with `read_file` (prefer entrypoints, configs, and recently changed files).
4. Write `REVIEW.md` in the workspace using `write_file` with:
   - Summary
   - Strengths
   - Risks / bugs
   - Suggested next steps
5. Keep the review concrete and tied to files you actually inspected.

## Constraints

- Stay inside the workspace.
- Only use tools listed for this skill.
- If a tool is denied by permissions, report that and continue with what you can.
