<p align="center">
  <img src="icon-128.png" alt="HatClaw" width="96" />
</p>

<h1 align="center">HatClaw</h1>

<p align="center">
  <strong>Open-source browser agent Chrome extension powered by any LLM provider</strong>
</p>

<p align="center">
  Use GPT-4o, HatClaw, Gemini, Grok, DeepSeek, Mistral, Llama, and 15+ other models as your browser agent — all from one extension.
</p>

---

## What is HatClaw?

HatClaw is a Chrome extension that gives any LLM the ability to see and control your browser. It works like a human assistant that can:

- **Take screenshots** and understand what's on screen
- **Click, type, scroll** and navigate web pages
- **Read page content** and extract information
- **Open tabs** and work across multiple pages
- **Record and replay workflows** for repetitive tasks
- **Orchestrate multiple agents** in parallel, with specialist reviews consolidated by a coordinator

Unlike other browser agents locked to a single provider, HatClaw lets you **bring your own API key** from any OpenAI-compatible provider — or use the Anthropic API directly.

### Automated multi-agent orchestration

Open **Settings → Multiagentes** to enable orchestration, choose 2–6 agents, and define each specialist's name, persona, behavioral characteristics, and private persistent memory. On each new user task, the specialists analyze the request in parallel and their reports are supplied privately to the coordinator, which makes the final decision and retains control of browser tools. Each agent receives only its own memory (limited to 8,000 characters), while tool-result turns continue through the coordinator without spawning duplicate teams.

When **Automatic learning** is enabled, each successful specialist stores a compact local record of the task and its conclusion. Repeated executions are deduplicated, the combined manual and learned memory remains capped at 8,000 characters, and learned entries can be cleared without deleting personas or manually entered memory.

## Supported Providers

| Provider | Models | Vision |
|----------|--------|--------|
| **OpenAI** | GPT-4o, GPT-4.1, o3, o4-mini | Yes |
| **Anthropic** | HatClaw 4 Sonnet, HatClaw 4 Opus | Yes |
| **Google** | Gemini 2.5 Pro/Flash | Yes |
| **xAI** | Grok 3, Grok 3 Mini | Yes |
| **DeepSeek** | DeepSeek-V3, DeepSeek-R1 | No |
| **Mistral** | Mistral Large, Pixtral Large | Pixtral only |
| **Groq** | Llama 4 Scout/Maverick, Llama 3.3 | Scout/Maverick |
| **Cerebras** | Llama 3.3 70B | No |
| **Perplexity** | Sonar Pro, Sonar Huge | No |
| **Z.AI** | GLM-4.6V, GLM-4.5V | Yes |
| **Custom** | Any OpenAI-compatible endpoint | Configurable |

Each provider gets its own **theme color** throughout the UI — the sidebar, send button, glow effects, and page border all match your active provider.

## Run Local Models

HatClaw works with **any OpenAI-compatible API**, which means you can run it with local models too. Point it at [Ollama](https://ollama.com), [LM Studio](https://lmstudio.ai), [LocalAI](https://localai.io), or any other local inference server that exposes an OpenAI-compatible endpoint.

**Setup:**
1. Start your local server (e.g., `ollama serve` or launch LM Studio)
2. In HatClaw settings, select the **Custom** provider
3. Set the base URL to your local endpoint (e.g., `http://localhost:11434/v1` for Ollama)
4. Enter any string as the API key (local servers usually don't require one, but the field can't be empty)
5. Select or type your model name

**Best models for local browser agents:**
- `llama-4-scout` or `llama-4-maverick` (vision + tool use)
- `qwen2.5-vl` (strong vision)
- Any model with vision and function calling support

> **Note:** Local model support is experimental. Performance depends heavily on your hardware and the model's ability to handle tool calls and vision inputs. Cloud providers with dedicated function calling support will generally give the most reliable results. If you run into issues, please [open an issue](https://github.com/Mushisushi28/HatClaw/issues) — we'd love to hear what works and what doesn't.

## Features

- **Multi-provider support** — Switch between providers and models mid-conversation from the dropdown
- **Automatic vision detection** — Knows which models support images and which don't, with safe fallback
- **Provider-themed UI** — Every color in the extension adapts to your active provider
- **Page glow border** — Pulsing colored border around the page while the agent is working
- **No account required** — No sign-up, no subscription. Just add your API key and go
- **Workflow recording** — Record browser actions and replay them later
- **GIF export** — Export recordings as GIFs
- **Tool use** — Models that support function calling get collapsible tool-use blocks in the chat

## Installation

1. Download or clone this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select this folder
5. Click the HatClaw icon in your toolbar to open the side panel
6. Go to **Settings** and add your API key for at least one provider

## Quick Start

1. Open any web page
2. Open HatClaw from the side panel
3. Select your provider and model from the dropdown at the top
4. Type a task like _"Find the cheapest flight from Calgary to Tokyo next month"_
5. Watch the agent work — it takes screenshots, clicks, scrolls, and reports back

## Configuration

Open the **Provider Settings** page from the extension options to:

- Enable/disable providers
- Enter API keys
- Set custom base URLs (for self-hosted or proxy endpoints)
- Choose default models
- Fetch available models from provider APIs

## Secure Windows control

HatClaw includes an optional native Windows controller for mouse, keyboard, windows, files, screenshots, applications and audited PowerShell. Native actions are typed and audited; PowerShell, destructive file changes, process launches and sensitive input require a local Windows confirmation.

1. Load the unpacked extension and copy its ID from `chrome://extensions`.
2. Open PowerShell in `native-host` and run `./install.ps1 -ExtensionId YOUR_EXTENSION_ID`.
3. Reload the extension.
4. Open `chrome-extension://YOUR_EXTENSION_ID/control-center.html`.

File access defaults to Desktop, Documents and Downloads. Copy `native-host/config.example.json` to `native-host/config.json` to change allowed roots and limits. Audit logs are written to `%LOCALAPPDATA%/HatClaw/audit`. Run `native-host/uninstall.ps1` to remove the registration.

## Architecture

HatClaw works by intercepting the stock extension's Anthropic API calls and translating them to OpenAI-compatible `chat/completions` requests. This means:

- The full browser automation toolkit (screenshots, clicks, navigation) works with any provider
- Tool calls are translated between Anthropic and OpenAI formats in real-time
- SSE streaming is translated on the fly
- Vision payloads are automatically downgraded for text-only models

Key files:

| File | Purpose |
|------|---------|
| `provider-registry.js` | Provider definitions, model lists, vision detection |
| `api-adapter.js` | API translation layer (Anthropic ↔ OpenAI) |
| `ui-branding.js` | Dynamic theme colors in the side panel |
| `brand-overlay.js` | Page glow border and stop button theming |
| `sidepanel-provider-menu.js` | Provider/model dropdown UI |
| `provider-settings.js` | Settings page for API keys and configuration |

## Roadmap

- [ ] **Persistent page glow** — Fix the colored glow border so it reliably pulses for all providers during agent activity
- [ ] **Conversation history** — Save and resume past agent sessions
- [ ] **Multi-tab workflows** — Coordinate actions across multiple tabs in a single task
- [ ] **Prompt templates** — Pre-built task templates for common workflows (form filling, data extraction, price comparison)
- [ ] **Better local model support** — Improve tool call translation for models with non-standard function calling formats
- [ ] **Export to Playwright/Puppeteer** — Convert recorded workflows to automation scripts
- [ ] **Provider cost tracking** — Track token usage and estimated cost per conversation
- [ ] **Firefox & Edge support** — Port the extension to other Chromium and non-Chromium browsers
- [ ] **Mobile support** — Bring browser agent capabilities to mobile browsers via Kiwi Browser or Firefox Android extensions

Have a feature idea? [Open an issue](https://github.com/Mushisushi28/HatClaw/issues) or submit a PR.

## Acknowledgments

HatClaw is built on top of Anthropic's [HatClaw for Chrome](https://chrome.google.com/webstore/detail/claude/danfohhfmbeahkgpceibgibfpkhokbfp) extension. We extended it with multi-provider support, local model compatibility, and a provider-themed UI.

## License

MIT

## Contributing

PRs welcome. If you add a new provider, add it to the `PROVIDERS` object in `provider-registry.js` with:
- `id`, `label`, `color`
- `baseUrl` and model list
- Vision support flags per model

Then add vision detection rules in `inferVisionSupport()` in the same file.
## Bot do Telegram

O bot encaminha mensagens do Telegram para o HatClaw pelo relay remoto e devolve os snapshots quando a resposta estabiliza. Fotos e documentos de imagem também são aceitos e entram como anexos de visão na próxima requisição. Quando o HatClaw gera uma imagem, o bot responde no Telegram com a própria imagem anexada. Requer Node.js 18 ou superior.

1. Crie um bot no `@BotFather` e copie o token.
2. O launcher tenta ler automaticamente o token do relay de `.browserking-remote.json`; só passe `-RelayToken` se quiser sobrescrever.
3. Inicie no PowerShell:

```powershell
.\start-telegram-bot.ps1 -BotToken 'TOKEN_DO_BOT' -RelayToken 'TOKEN_DO_RELAY'
```

Para restringir o acesso, informe os IDs numéricos separados por vírgula:

```powershell
.\start-telegram-bot.ps1 -BotToken 'TOKEN_DO_BOT' -RelayToken 'TOKEN_DO_RELAY' -AllowedChats '123456789,987654321'
```

Comandos disponíveis: `/start`, `/help` e `/status`. Qualquer outra mensagem é enviada como tarefa ao navegador. Imagens enviadas com legenda usam a legenda como tarefa; imagens sem legenda recebem um texto padrão de análise. Se o HatClaw devolver uma imagem na resposta, o bot reenvia essa imagem para o chat ativo. Tokens nunca são persistidos pelo bot; apenas cursores e IDs dos chats registrados são mantidos em `.browserking-telegram-state.json`.
