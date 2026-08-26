# Agents and chat

## Agents (teammates)

Each teammate has: name/slug, instructions, model, tools, skills, workspace folder, optional browser profile.

Create via UI **Agents**, onboarding, or `sora agent create`.

## From Bot Directory or a pasted prompt

Listings and custom prompts are **setup prompts**, not finished system prompts:

1. **Teammates** (or onboarding): paste a prompt, or search Bot Directory — one screen.
2. Sora creates a teammate shell and sends the prompt as the **first chat message**.
3. The teammate asks for niche/voice/boundaries, helps connect apps, runs a supervised first pass.
4. Optional: save a **Routine** after you approve the shape of the work.

API: `POST /api/botdirectory/import` → `{ agent, setupPrompt, bot }`.

Do **not** paste passwords into chat. Connect apps under **Connected apps** (Composio), store extras under **Private secrets**, or **Take control** on the computer and type logins yourself.


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
