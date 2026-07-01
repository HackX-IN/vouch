<p align="center">
  <h1 align="center">🕸️ Vouch</h1>
  <p align="center">
    <strong>AI-powered browser automation. Write tests in plain English.</strong>
  </p>
  <p align="center">
    Zero selectors. Zero XPaths. Zero DOM queries. Just tell it what to do.
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@inamul_hasan/vouch"><img src="https://img.shields.io/npm/v/@inamul_hasan/vouch?style=flat-square&color=cb3837&label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@inamul_hasan/vouch"><img src="https://img.shields.io/npm/dm/@inamul_hasan/vouch?style=flat-square&color=blue&label=downloads" alt="npm downloads"></a>
  <a href="https://github.com/HackX-IN/vouch/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/HackX-IN/vouch/ci.yml?style=flat-square&label=build" alt="CI"></a>
  <a href="https://github.com/HackX-IN/vouch/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@inamul_hasan/vouch?style=flat-square&color=green" alt="license"></a>
  <a href="https://github.com/HackX-IN/vouch"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square" alt="Node.js"></a>
  <a href="https://github.com/HackX-IN/vouch/blob/main/SECURITY.md"><img src="https://img.shields.io/badge/security-policy-blueviolet?style=flat-square" alt="Security Policy"></a>
</p>

---

Vouch is a **vision-first browser automation framework** that acts like a human QA engineer. It reads the screen as a canvas using Vision Language Models (VLMs), understands UI components through AI, and interacts by clicking and typing at exact pixel coordinates.

**No CSS selectors. No XPaths. No Accessibility Trees. No brittle locators.**

```
click on the email input field
type user@example.com into the email field
click the Login button
```

That's a real Vouch test. It just works.

---

## Why Vouch?

| Traditional Testing | Vouch |
|---|---|
| `page.getByRole('button', { name: 'Submit' })` | `click the Submit button` |
| Tests break when devs rename CSS classes | Tests survive UI refactors — AI adapts |
| Only developers can write tests | PMs, QA, and non-devs can write tests |
| Requires deep framework knowledge | Requires knowing English |
| Selector maintenance is a full-time job | Zero maintenance — describe what you see |

### How It's Different From Other Tools

| Feature | Vouch | Playwright | Selenium | Applitools | Testim |
|---|---|---|---|---|---|
| **Test Language** | Plain English | JavaScript/TypeScript | Java/Python/JS | SDK code | Low-code UI |
| **Element Selection** | AI Vision (zero selectors) | CSS/XPath/Role | CSS/XPath/ID | Augments existing | Smart Locators |
| **Self-Healing** | ✅ Actor-Critic loop | ❌ | ❌ | ❌ | ✅ |
| **Local/Private AI** | ✅ Ollama (100% offline) | N/A | N/A | ❌ Cloud only | ❌ Cloud only |
| **Non-Dev Friendly** | ✅ | ❌ | ❌ | ❌ | ⚠️ Partial |
| **Open Source** | ✅ MIT | ✅ Apache-2.0 | ✅ Apache-2.0 | ❌ Paid | ❌ Paid |
| **Survives Refactors** | ✅ | ❌ Selectors break | ❌ Selectors break | ⚠️ Visual only | ⚠️ Partial |

> **Vouch doesn't replace Playwright — it's powered by it.** Playwright handles the reliable browser layer. Vouch replaces the brittle selector layer with AI vision.

---

## Features

- 🧠 **Multi-Model AI Engine** — GPT-4o, Claude, Gemini, or any local Ollama VLM
- 🎯 **Zero Selectors** — No CSS, XPath, DOM queries, or Accessibility Tree traversal. Pure visual coordinate extraction.
- 🔄 **Self-Healing** — Actor-Critic loop auto-corrects validation errors and retries failed steps
- 📝 **Plain English Tests** — Write tests in natural language with typo tolerance in `.vch` files
- 🔒 **100% Private Option** — Run entirely offline with Ollama. No data leaves your machine.
- 📸 **Named Screenshots** — `@screenshot <name>` saves a PNG snapshot at any point in a test
- 📊 **JSON Reports** — Timestamped JSON reports under `.vouch/reports/`
- 🎥 **Video Recording** — Full session video capture via Playwright's native recording
- 🔍 **Playwright Traces** — Interactive trace playback for debugging with `npx playwright show-trace`
- ⚡ **Low-Latency** — Warm browser singletons, streaming JSON cutoff, and heavy asset blocking
- 🖥️ **Interactive CLI** — Guided console with spinners, file search, and multi-file execution
- 🧪 **Conditional Logic** — `@if`/`@endif` blocks for branching test flows
- 🚀 **Parallel Execution** — `vouch run-all` runs all `.vch` files with configurable concurrency
- 🏭 **CI-Ready** — `--ci` flag forces headless mode, enables failure screenshots, skips video

---

## Quick Start

```bash
# Install globally
npm install -g @inamul_hasan/vouch

# Interactive mode (recommended)
vouch

# Run a test directly
vouch run examples/demo.vch
```

### First Test in 60 Seconds

```bash
# 1. Install
npm install -g @inamul_hasan/vouch

# 2. Set your API key (or use Ollama for free local testing)
export VOUCH_API_KEY=sk-your-openai-key

# 3. Create a test
cat > my-test.vch << 'EOF'
> name: My First Test

@navigate https://the-internet.herokuapp.com/login

type tomsmith into the username field
type SuperSecretPassword! into the password field
click the login button

@assert Secure Area page is visible with logout button
EOF

# 4. Run it
vouch run my-test.vch --provider openai --model gpt-4o
```

---

## Writing Tests (`.vch` Format)

Tests are plain English instructions in `.vch` files. Vouch is heavily typo-tolerant — it maps your intent to visible elements on the screen.

### Example: E-Commerce Checkout

```
> name: SauceDemo E2E Flow

@navigate https://www.saucedemo.com/

# Login
type standard_user into the Username field
type secret_sauce into the Password field
click the Login button

# Add to Cart
click the first Add to cart button

# Checkout
click the shopping cart icon
click the Checkout button

# Shipping Info
type John into the First Name field
type Doe into the Last Name field
type 90210 into the Zip/Postal Code field
click the Continue button

# Finalize
click the Finish button
@assert Thank you for your order! is visible
```

### Syntax Reference

| Prefix | Purpose | Example |
|---|---|---|
| `>` | Metadata | `> name: My Test Suite` |
| `#` | Comment | `# This is a comment` |
| `@navigate` | Navigate to URL | `@navigate https://example.com` |
| `@wait` | Wait (ms) | `@wait 3000` |
| `@assert` | Visual assertion | `@assert Login form is visible` |
| `@screenshot` | Save named PNG snapshot | `@screenshot after-login` |
| `@if` | Conditional block | `@if dialog is visible` |
| `@endif` | End conditional | `@endif` |
| _(plain text)_ | Action instruction | `click the blue submit button` |

### Conditional Blocks

Use `@if`/`@endif` to handle dynamic UI states:

```
@if cookie consent dialog is visible
click the Accept button
@endif

click on the search input
type hello world into the search field
```

### Named Screenshots

Capture a PNG snapshot of the viewport at any point — no AI call, instant:

```
@navigate https://app.example.com
log in to the dashboard
@screenshot dashboard-loaded
click the Settings tab
@screenshot settings-page
```

Screenshots are saved to `.vouch/screenshots/` with a timestamp suffix.

---

## Running Multiple Tests

```bash
# Run all .vch files in a directory
vouch run-all ./tests

# Run 3 files in parallel
vouch run-all ./tests --concurrency 3 --ci

# Run with CI defaults (headless, no video, fail screenshots)
vouch run-all ./tests --ci
```

---

## Configuration

Create `vouch.config.json` in your project root (auto-created on first run):

```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "viewportWidth": 1280,
  "viewportHeight": 800,
  "headless": false,
  "maxRetries": 3,
  "actionDelay": 50,
  "stepTimeout": 30000,
  "report": true,
  "reportDir": "./.vouch/reports",
  "recordVideo": false,
  "videoDir": "./.vouch/videos",
  "consolidateVideo": false,
  "recordTrace": true,
  "traceDir": "./.vouch/traces"
}
```

### Configuration Reference

| Key | Type | Default | Description |
|---|---|---|---|
| `provider` | `string` | `"openai"` | AI provider: `openai`, `anthropic`, `google`, `ollama` |
| `model` | `string` | `"gpt-4o"` | Model identifier for the chosen provider |
| `apiKey` | `string` | — | API key (prefer `VOUCH_API_KEY` env var) |
| `baseUrl` | `string` | — | Base URL override for Ollama or API proxies |
| `viewportWidth` | `number` | `1280` | Browser viewport width in pixels |
| `viewportHeight` | `number` | `800` | Browser viewport height in pixels |
| `headless` | `boolean` | `false` | Run browser without visible window |
| `maxRetries` | `number` | `3` | Max retry attempts per step (Actor-Critic loop) |
| `actionDelay` | `number` | `50` | Delay between actions in milliseconds |
| `stepTimeout` | `number` | `30000` | Timeout per step in milliseconds |
| `report` | `boolean` | `true` | Generate JSON test reports |
| `reportDir` | `string` | `"./.vouch/reports"` | Report output directory |
| `recordVideo` | `boolean` | `false` | Record video of the browser session |
| `videoDir` | `string` | `"./.vouch/videos"` | Video output directory |
| `consolidateVideo` | `boolean` | `false` | Remove idle frames from video (requires FFmpeg) |
| `recordTrace` | `boolean` | `true` | Record Playwright trace for interactive debugging |
| `traceDir` | `string` | `"./.vouch/traces"` | Trace output directory |
| `screenshotQuality` | `number` | `80` | JPEG quality for action screenshots (1–100) |
| `assertionScreenshotPng` | `boolean` | `true` | Use lossless PNG for assertion steps (better AI accuracy) |
| `ci` | `boolean` | `false` | CI mode: headless, no video, report + failure screenshots enabled |

### Environment Variables

| Variable | Description |
|---|---|
| `VOUCH_PROVIDER` | AI provider (`openai`, `anthropic`, `google`, `ollama`) |
| `VOUCH_MODEL` | Model identifier |
| `VOUCH_API_KEY` | API key for the provider |
| `VOUCH_BASE_URL` | Base URL override |
| `VOUCH_HEADLESS` | `true` or `false` |
| `VOUCH_RETRIES` | Max retries per step (number) |
| `VOUCH_TIMEOUT` | Per-step timeout in milliseconds |
| `VOUCH_VERBOSE` | `true` or `false` |
| `VOUCH_CI` | `true` to enable CI mode |

### Supported AI Providers

| Provider | Models | Cost | Latency | Privacy |
|---|---|---|---|---|
| **Ollama** (local) | `llava-phi3`, `moondream2`, any VLM | 🆓 Free | ⚡ Fast | 🔒 100% local |
| **OpenAI** | `gpt-4o`, `gpt-4o-mini` | 💰 Per token | ⚡ Fast | ☁️ Cloud |
| **Anthropic** | `claude-sonnet-4-20250514` | 💰 Per token | ⚡ Fast | ☁️ Cloud |
| **Google** | `gemini-2.0-flash` | 💰 Per token | ⚡ Fast | ☁️ Cloud |

> 💡 **Want zero API costs?** Use Ollama with a local vision model. Install Ollama, pull a vision model (`ollama pull llava-phi3`), and set `provider: "ollama"` in your config. All processing stays on your machine.

### CLI Flags

Override any config option directly from the terminal:

```bash
vouch run test.vch \
  --provider openai \
  --model gpt-4o \
  --api-key sk-xxx \
  --storage-state ./auth.json \
  --headless \
  --retries 5 \
  --timeout 60000 \
  --viewport 1920x1080 \
  --report-dir ./reports \
  --ci
```

---

## Debugging & Reports

### JSON Reports

Every test run generates a detailed JSON report in `.vouch/reports/`:

```json
{
  "suite": { "name": "Login Flow", "filePath": "/path/to/test.vch" },
  "totalPassed": 5,
  "totalFailed": 0,
  "results": [
    {
      "step": { "instruction": "click the Login button", "type": "action" },
      "status": "passed",
      "duration": 1234,
      "attempts": [
        { "attempt": 1, "action": "click", "x": 640, "y": 450, "success": true }
      ]
    }
  ]
}
```

### Playwright Traces

Vouch records Playwright traces by default. View interactive playback with:

```bash
npx playwright show-trace .vouch/traces/trace-2026-06-30T12-00-00-000Z.zip
```

This gives you a full timeline of every action, screenshot, and network request — **the most powerful debugging tool** for understanding what happened during a test run.

### Video Recording

Enable video recording to capture the full browser session:

```json
{
  "recordVideo": true,
  "consolidateVideo": true
}
```

With `consolidateVideo: true`, Vouch uses FFmpeg to strip idle frames (during AI inference), producing a clean, fast-forwarded playback of just the interactions.

---

## Architecture

```
Viewport Image → VisionQA Engine (AI) → Action JSON → Browser Controller → Verify
                                         ↑                                     ↓
                                    Self-Heal ← ── Validation Error Detected ←─┘
```

### The Actor-Critic Loop

1. **Actor**: Captures the viewport → sends to VLM → receives action coordinates
2. **Action**: Executes the action on exact pixel coordinates via Playwright
3. **Critic**: On `@assert` steps or validation errors, evaluates the result and triggers self-healing retries with corrected strategy

### Performance Optimizations

| Optimization | Impact |
|---|---|
| **Warm Singleton Browser** | Eliminates cold starts across test contexts |
| **Streaming JSON Cutoff** | Aborts inference the moment valid JSON is received |
| **Route Blocking (once)** | Asset/analytics blocking registered once at launch — no per-navigate overhead |
| **Dual Screenshot Modes** | PNG for assertions (accuracy), JPEG for actions (speed) |
| **Lightweight Assertion Prompt** | Separate smaller system prompt for `@assert`/`@if` steps — ~40% fewer tokens |
| **Token-Optimized Prompts** | Compressed system prompt and dense history ledger format |
| **`keep_alive` (Ollama)** | Keeps models hot in VRAM between inference calls |
| **`domcontentloaded`** | Faster navigation without waiting for all network requests |

---

## Output Artifacts

```
.vouch/
├── reports/          # Timestamped JSON test reports
├── videos/           # Session video recordings (.webm)
└── traces/           # Playwright trace archives (.zip)
```

---

## CI/CD Integration

Vouch works in headless CI environments. Use `--ci` (or `VOUCH_CI=true`) for a single flag that sets headless, disables video, and enables failure screenshots automatically:

```yaml
# GitHub Actions example
- name: Install Vouch
  run: npm install -g @inamul_hasan/vouch

- name: Install Playwright browsers
  run: npx playwright install chromium --with-deps

- name: Run E2E tests
  env:
    VOUCH_API_KEY: ${{ secrets.VOUCH_API_KEY }}
    VOUCH_PROVIDER: openai
    VOUCH_MODEL: gpt-4o
  run: vouch run tests/checkout.vch --ci

- name: Run all tests in parallel
  env:
    VOUCH_API_KEY: ${{ secrets.VOUCH_API_KEY }}
  run: vouch run-all ./tests --ci --concurrency 3
```

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Security

Found a vulnerability? See our [Security Policy](SECURITY.md) for responsible disclosure.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a full history of releases.

## License

MIT — see [LICENSE](LICENSE) for details.

Copyright © 2026 [Inamul Hasan](https://github.com/HackX-IN)
