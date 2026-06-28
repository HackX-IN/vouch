# 🕸️ Vouch

**Zero-selector, vision-driven web automation. Blazing fast.**

Vouch acts like a human QA engineer — it reads the screen via Chrome's Accessibility Tree, understands UI components through AI, and interacts by clicking and typing at exact coordinates. No DOM, no selectors, no XPaths.

## Features

- 🧠 **AI-Powered Engine** — Uses GPT-4o, Claude, Gemini, or local Ollama models (like qwen2.5-coder) to interpret the UI.
- 🎯 **Zero Selectors** — No CSS, XPath, or DOM queries. Navigates natively via Chrome's Accessibility API.
- 🔄 **Self-Healing** — Actor-Critic loop auto-corrects form validation errors and retries failed steps.
- 📝 **Plain English Tests** — Write tests in natural language with typo tolerance in `.vch` files.
- 📁 **Smart Inputs** — Natively handles file uploads, calendars, dropdowns, hover, scroll, and keypresses.
- 📊 **JSON Reports** — Auto-generated timestamped JSON reports under `.vouch/reports/`.
- 🎥 **Video Recording** — Full session video capture via `puppeteer-screen-recorder`.
- ⚡ **Low-Latency** — Persistent CDP sessions, batched AX tree resolution, instant typing, and optimized token usage.
- 🖥️ **Interactive CLI** — Daytona-style interactive console with spinners, file search, and guided execution.

## Quick Start

```bash
# Install
npm install -g vouch-qa

# Interactive Mode (Recommended)
vouch

# Run a test directly
vouch run examples/demo.vch
```

## Writing Tests

Create a `.vch` file with plain English instructions:

```
> name: Login Flow Test

@navigate https://myapp.com/login

click on the email input field
type user@example.com into the email field
click the password field
type MyPassword123! into the password field
click the Login button

@assert Dashboard is visible
```

### Syntax

| Prefix | Purpose | Example |
|--------|---------|---------|
| `>` | Metadata | `> name: My Test Suite` |
| `#` | Comment | `# This is a comment` |
| `@navigate` | Navigate to URL | `@navigate https://example.com` |
| `@wait` | Wait (ms) | `@wait 3000` |
| `@assert` | Visual assertion | `@assert Login form is visible` |
| `@if` | Conditional | `@if dialog is visible` |
| *(plain text)* | Action instruction | `click the blue submit button` |

## Configuration

Create `vouch.config.json` in your project root (auto-created on first run):

```json
{
  "provider": "ollama",
  "model": "qwen2.5-coder:3b",
  "viewportWidth": 1280,
  "viewportHeight": 800,
  "headless": false,
  "maxRetries": 3,
  "actionDelay": 200,
  "stepTimeout": 30000,
  "report": true,
  "reportDir": "./.vouch/reports",
  "recordVideo": true,
  "videoDir": "./.vouch/videos"
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VOUCH_PROVIDER` | AI provider (`openai`, `anthropic`, `google`, `ollama`) |
| `VOUCH_MODEL` | Model identifier |
| `VOUCH_API_KEY` | API key for the provider |
| `VOUCH_BASE_URL` | Base URL override |
| `VOUCH_HEADLESS` | `true` or `false` |

### CLI Flags

```bash
vouch run test.vch \
  --provider openai \
  --model gpt-4o \
  --api-key sk-xxx \
  --headless \
  --retries 5 \
  --viewport 1920x1080 \
  --report-dir ./reports
```

## Project Structure

```
.vouch/
├── reports/          # Timestamped JSON test reports
└── videos/           # Session video recordings (.mp4)
```

## Architecture

```
Accessibility Tree → VisionQA Engine (AI) → Action JSON → Browser Controller → Verify
                                         ↑                                     ↓
                                    Self-Heal ← ── Validation Error Detected ←─┘
```

The **Actor-Critic Loop**:
1. **Actor**: Reads the accessibility tree → sends to AI → executes the returned action.
2. **Critic**: Validates the result on `@assert` steps or when validation errors block progress, triggering self-healing retries.

### Performance Optimizations

- **Persistent CDP session** — reused across all accessibility reads (no create/detach overhead per step).
- **Batched box model resolution** — all element coordinates resolved in parallel via `Promise.allSettled`.
- **Instant keyboard typing** — zero per-character delay.
- **Token-optimized prompts** — compressed system prompt and dense history ledger format.
- **`keep_alive`** — keeps Ollama models hot in VRAM between calls.
- **`domcontentloaded`** — faster navigation without waiting for all network requests.

## License

MIT

