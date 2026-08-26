# Agents and chat

## Agents

Each agent has: name/slug, instructions, model, tools, skills, workspace folder, optional browser profile.

Create via UI **Agents** or `sora agent create`.

## Chat UX

- Streaming replies over SSE
- `/skill-name` activates a skill
- `@agent` routes the next message to another agent
- Tool chips show live tool status
- Approvals appear inline (see [permissions.md](./permissions.md))
- PromptBar model menu updates the **agent’s** model (not display-only)

## Multi-agent

- `delegate_task` — nested run on another agent
- `agent_message` — queue into inbox (or `deliver: run` to trigger immediately)
- Unread inbox lines inject into the system prompt on the next run

## Skills

Disk packs under `~/.sora/skills` and `examples/skills`. Install/list via CLI or discover on start. Type `/` in chat when the skill is available on the agent.
