# Providers

Every agent uses a `provider:model` string, e.g. `openrouter:anthropic/claude-sonnet-4`.

Keys live encrypted in `~/.sora/secrets.json` (machine key in `.encryption-key`, or `SORA_ENCRYPTION_KEY`). The API never returns raw keys (hints only).

| Provider | Kind | Notes |
|----------|------|-------|
| mock | LLM | Offline tests |
| ollama | LLM | Local, free |
| openai | LLM | `OPENAI_API_KEY` / `SORA_API_KEY` |
| anthropic | LLM | Via OpenRouter-compatible gateway by default |
| google | LLM | Gemini OpenAI-compat endpoint |
| xai | LLM | Grok models |
| groq / together / azure | LLM | Fast / open / enterprise |
| openrouter | LLM | One key, many vendors |
| e2b | **Infra** | Sandbox only — not a chat model |

Infra keys appear in Settings but are excluded from the chat model picker.

See also [sandbox-security.md](./sandbox-security.md).
