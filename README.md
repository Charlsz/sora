# Sora

**AI teammates with a cloud computer. Your keys, no Sora account.**

One named teammate, chat on the left, live sandbox on the right, Watch or Open on. Wallpaper behind the chrome. Bring your own keys (OpenAI / Claude / Gemini / Grok).

## Install (Win / Mac)

Download the Windows or macOS installer from a `v*` draft release on GitHub:

https://github.com/Charlsz/sora/releases

Tag a version (`v0.1.0`, …) to build installers in CI.

## First run

1. Your name
2. Model API key (OpenAI, Claude, Gemini, Grok, OpenRouter, …)
3. E2B key (cloud computer)
4. Create your first teammate
5. Chat, then **Watch** or **Open** the computer
6. When asked: **Allow once** / **Allow session** / **Deny**

## What you get

- Teammates you message like coworkers
- Each runs in a **cloud sandbox VM** (browser, files, terminal, desktop)
- **Watch** / **Open** the computer so you can sign in and approve when needed
- Local schedules (cron) while the app is running
- Keys stay on your machine (`~/.sora`)

## From source

```bash
bun install
bun run sora init
bun run desktop
```

```bash
bun test
bun run desktop:package
```

## Docs

[docs/index.md](docs/index.md) · [overview](docs/overview.md)

## License

See [LICENSE](LICENSE).
