# Complete Usage Guide for Vouch

Vouch is a **zero-selector, AI-powered browser automation framework**. Unlike traditional tools like Selenium or Playwright's selector-based API, Vouch doesn't rely on CSS selectors, XPaths, or even the Accessibility Tree. Instead, it reads the screen visually as a canvas using a **Vision Language Model (VLM)**, and predicts exact `x, y` pixel coordinates to click and interact with via Playwright.

---

## 1. Installation

Install Vouch globally using npm:

```bash
npm install -g @inamul_hasan/vouch
```

Or use it in a project:

```bash
npm install --save-dev @inamul_hasan/vouch
```

**Prerequisites:**
- Node.js ≥ 18
- An AI provider API key (OpenAI, Anthropic, or Google) **OR** [Ollama](https://ollama.ai) installed locally for free, private testing

---

## 2. Quick Initialization

Navigate to your project folder and run Vouch. If it's your first time, it will automatically generate a `vouch.config.json` file for you.

```bash
vouch
```

*This launches the interactive CLI menu where you can configure providers and run tests easily.*

To manually initialize:

```bash
vouch init
```

---

## 3. Writing Tests (The `.vch` Format)

Tests in Vouch are written in plain English inside `.vch` files. Vouch is heavily typo-tolerant and understands fuzzy instructions because it maps your intent to visible elements on the screen.

### Example Test (`login.vch`):

```text
> name: Real World Login

@navigate https://the-internet.herokuapp.com/login

# Login flow
click on the username input field
type tomsmith into the username field
click on the password input field
type SuperSecretPassword! into the password field
click on the login button

@wait 2000

@assert Secure Area page is visible with logout button
```

### Available Commands

| Command | Description | Example |
|---|---|---|
| `>` | Defines suite metadata (like test name). | `> name: My Test` |
| `#` | A comment line. Ignored by the engine. | `# Click the button` |
| `@navigate` | Navigates the browser to a specific URL. | `@navigate https://google.com` |
| `@wait` | Pauses execution for a set amount of milliseconds. | `@wait 3000` |
| `@assert` | Triggers the Critic loop to verify a specific visual state. | `@assert Modal is open` |
| `@if` | Starts a conditional block (executes if condition is true). | `@if dialog is visible` |
| `@endif` | Closes a conditional block. | `@endif` |
| *(plain text)* | Any natural language instruction. | `click the blue submit button` |

### Multi-Action Steps

You can chain multiple actions in a single instruction line:

```text
type standard_user into the Username field, type secret_sauce into the Password field, and click the Login button
```

### Conditional Blocks

Handle dynamic UI states that may or may not appear:

```text
@if cookie consent banner is visible
click the Accept All button
@endif

@if popup dialog is showing
click the Close button
@endif

# Continue with main test flow
click on the search input
type hello world
```

Conditional blocks can be nested:

```text
@if sidebar is expanded
  @if settings icon is visible
  click the settings icon
  @endif
@endif
```

---

## 4. Configuration & AI Providers

The behavior of Vouch is controlled by `vouch.config.json` located in the directory where you run the command.

### Example Configuration

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

### Full Configuration Reference

| Key | Type | Default | Description |
|---|---|---|---|
| `provider` | `string` | `"openai"` | AI provider: `openai`, `anthropic`, `google`, `ollama` |
| `model` | `string` | `"gpt-4o"` | Model identifier for the chosen provider |
| `apiKey` | `string` | — | API key (prefer `VOUCH_API_KEY` env var for security) |
| `baseUrl` | `string` | — | Base URL override (for Ollama custom ports or API proxies) |
| `viewportWidth` | `number` | `1280` | Browser viewport width in pixels |
| `viewportHeight` | `number` | `800` | Browser viewport height in pixels |
| `headless` | `boolean` | `false` | Run browser without visible window |
| `maxRetries` | `number` | `3` | Max retry attempts per step (Actor-Critic loop) |
| `actionDelay` | `number` | `50` | Delay between consecutive actions in milliseconds |
| `stepTimeout` | `number` | `30000` | Timeout per step in milliseconds |
| `report` | `boolean` | `true` | Generate JSON test reports |
| `reportDir` | `string` | `"./.vouch/reports"` | Report output directory |
| `recordVideo` | `boolean` | `false` | Record video of the browser session |
| `videoDir` | `string` | `"./.vouch/videos"` | Video output directory |
| `consolidateVideo` | `boolean` | `false` | Post-process video to strip idle frames (requires FFmpeg) |
| `recordTrace` | `boolean` | `true` | Record Playwright trace for interactive debugging |
| `traceDir` | `string` | `"./.vouch/traces"` | Trace output directory |

### Supported Providers

Vouch supports cloud models and local infrastructure natively. You must set the respective environment variable for cloud models:

#### 1. Ollama (Local / Free / Private)

Best for: low-latency offline testing, data-sensitive environments.

```json
{ "provider": "ollama", "model": "qwen3-vl:2b-instruct" }
```

Requires Ollama running locally:
```bash
ollama pull qwen3-vl:2b-instruct
ollama run qwen3-vl:2b-instruct
```

No API key needed. All data stays on your machine.

#### 2. OpenAI

```json
{ "provider": "openai", "model": "gpt-4o" }
```

Set `VOUCH_API_KEY` to your OpenAI API key. Also supports `gpt-4o-mini` for lower cost.

#### 3. Anthropic

```json
{ "provider": "anthropic", "model": "claude-sonnet-4-20250514" }
```

Set `VOUCH_API_KEY` to your Anthropic API key.

#### 4. Google Gemini

```json
{ "provider": "google", "model": "gemini-2.0-flash" }
```

Set `VOUCH_API_KEY` to your Google Gemini API key.

---

## 5. Running Tests from the CLI

You can bypass the interactive menu and run tests directly in CI/CD environments or scripts.

### Basic Run

```bash
vouch run examples/login.vch
```

### Overriding Configuration via Flags

You can override `vouch.config.json` directly from the terminal:

```bash
vouch run tests/checkout.vch \
  --provider openai \
  --model gpt-4o \
  --api-key sk-xxxxxx \
  --headless \
  --retries 5 \
  --viewport 1920x1080 \
  --report-dir ./reports
```

### Running Multiple Tests

Use the interactive mode to select and run multiple `.vch` files:

```bash
vouch
# Select "Run specific tests" → choose files → execute
```

Or run all tests:

```bash
vouch
# Select "Run all tests"
```

---

## 6. Debugging Test Failures

### JSON Reports

Every test run generates a detailed JSON report in `.vouch/reports/`. Reports include:
- Every step's instruction, status, and duration
- Exact coordinates clicked per attempt
- Validation errors detected by the Critic
- Full retry history with error messages

**API keys are automatically masked** in all reports.

### Playwright Traces (Recommended)

Traces are enabled by default (`recordTrace: true`). After a test run:

```bash
npx playwright show-trace .vouch/traces/trace-2026-06-30T12-00-00-000Z.zip
```

This opens an interactive trace viewer showing:
- Screenshot timeline of every action
- Network requests
- Console logs
- Full DOM snapshots at each step

This is the **most powerful debugging tool** for understanding why a step failed.

### Video Recording

For visual playback of the entire session:

```json
{
  "recordVideo": true,
  "consolidateVideo": true
}
```

With `consolidateVideo: true`, Vouch uses FFmpeg to strip idle frames (during VLM inference wait time), producing a clean, fast-forwarded video of just the interactions.

---

## 7. Understanding the Actor-Critic Loop

Vouch doesn't just blindly click things. It uses an **Actor-Critic AI architecture**:

1. **Actor Phase:** Vouch captures a JPEG buffer of the web page viewport and sends it to the VLM. The AI maps your instruction to the exact bounding box and pixel coordinates of an element.
2. **Action Phase:** Vouch physically moves the mouse to the pixel coordinates and executes the click or keystroke.
3. **Critic Phase:** If you use an `@assert` command, or if a form validation fails (e.g., a visible red error appears saying "Password too short"), Vouch's Critic kicks in. The Critic evaluates the failure, rewrites the history ledger, and **automatically retries** the step with a corrected strategy.

### Self-Healing in Action

```
Step: "type admin into the email field"
  → Attempt 1: Clicks (640, 300) → types "admin"
  → Validation error detected: "Please enter a valid email"
  → Attempt 2: Critic corrects → types "admin@company.com"
  → ✅ Passed
```

### Backtracking

If an `@assert` fails, Vouch backtracks to the previous action step and retries with different coordinates or strategy. This makes tests more resilient to layout shifts and dynamic content.

Because Vouch operates purely visually, **if a human can figure out how to interact with the UI, Vouch can too.**

---

## 8. CI/CD Integration

### GitHub Actions

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Vouch
        run: npm install -g @inamul_hasan/vouch

      - name: Install Playwright browsers
        run: npx playwright install chromium --with-deps

      - name: Run tests
        env:
          VOUCH_API_KEY: ${{ secrets.VOUCH_API_KEY }}
          VOUCH_PROVIDER: openai
          VOUCH_MODEL: gpt-4o
          VOUCH_HEADLESS: true
        run: vouch run tests/**/*.vch

      - name: Upload traces on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: vouch-traces
          path: .vouch/traces/
```

### Environment Variable Configuration

For CI/CD, avoid config files entirely:

```bash
export VOUCH_PROVIDER=openai
export VOUCH_MODEL=gpt-4o
export VOUCH_API_KEY=sk-xxxxx
export VOUCH_HEADLESS=true

vouch run tests/checkout.vch
```

---

## 9. Tips & Best Practices

### Writing Effective Test Instructions

- **Be specific about which element to target:** `click the blue Submit button` is better than `click submit`
- **Use spatial hints for ambiguous elements:** `click the Save button in the main content area` (not the one in the sidebar)
- **Break complex interactions into steps:** Separate typing and clicking into individual lines for reliability
- **Use `@wait` sparingly:** Vouch has built-in visual settle detection, but explicit waits help for slow SPAs

### Performance Tips

- Use `headless: true` for faster execution
- Use `gpt-4o-mini` or Ollama for lower latency per step
- Keep `actionDelay` low (50ms) for fast-paced interactions
- Enable `recordTrace` instead of `recordVideo` for lighter resource usage
- Use `consolidateVideo` to strip idle time from recorded videos

### Cost Management

| Provider | Approximate Cost/Step | Monthly @ 100 tests/day |
|---|---|---|
| Ollama (local) | $0.00 | $0.00 |
| GPT-4o-mini | ~$0.005 | ~$15 |
| GPT-4o | ~$0.02 | ~$60 |
| Claude Sonnet | ~$0.015 | ~$45 |
| Gemini Flash | ~$0.003 | ~$9 |

> 💡 For cost-conscious teams: Use Ollama locally during development, cloud providers for CI/CD only.
