# Complete Usage Guide for Vouch

Vouch is a blazing-fast, zero-selector, vision-driven web automation framework. Unlike traditional tools like Selenium, Vouch doesn't rely on CSS selectors, XPaths, or even the Accessibility Tree. Instead, it reads the screen purely visually as a canvas using a **Vision Language Model (VLM)**, and predicts exact `x, y` pixel coordinates to click and interact with via Playwright.

---

## 1. Installation

Install Vouch globally using npm:

```bash
npm install -g @inamul_hasan/vouch
```

---

## 2. Quick Initialization

Navigate to your project folder and run Vouch. If it's your first time, it will automatically generate a \`vouch.config.json\` file for you.

```bash
vouch
```

*This launches the interactive Daytona-style CLI menu where you can configure providers and run tests easily.*

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

### Available Commands:

| Command | Description | Example |
|---|---|---|
| \`>\` | Defines suite metadata (like test name). | \`> name: My Test\` |
| \`#\` | A comment line. Ignored by the engine. | \`# Click the button\` |
| \`@navigate\` | Navigates the browser to a specific URL. | \`@navigate https://google.com\` |
| \`@wait\` | Pauses execution for a set amount of milliseconds. | \`@wait 3000\` |
| \`@assert\` | Triggers the Critic loop to verify a specific visual state. | \`@assert Modal is open\` |
| *(plain text)* | Any natural language instruction. | \`click the blue submit button\` |

---

## 4. Configuration & AI Providers

The behavior of Vouch is controlled by \`vouch.config.json\` located in the directory where you run the command.

### Example Configuration:
```json
{
  "provider": "ollama",
  "model": "qwen3-vl:2b-instruct",
  "viewportWidth": 1280,
  "viewportHeight": 800,
  "headless": true,
  "maxRetries": 3,
  "actionDelay": 200,
  "stepTimeout": 30000,
  "report": true,
  "reportDir": "./.vouch/reports",
  "recordVideo": true,
  "videoDir": "./.vouch/videos"
}
```

### Supported Providers:

Vouch supports cloud models and local infrastructure natively. You must set the respective environment variable for cloud models:

1. **Ollama (Local / Free)** 
   - Great for low latency offline testing.
   - Requires Ollama running locally. (e.g. \`ollama run qwen3-vl:2b-instruct\`)
   - **Provider:** \`ollama\`
2. **OpenAI**
   - **Provider:** \`openai\` | **Model:** \`gpt-4o\` or \`gpt-4o-mini\`
   - **Env Var:** \`VOUCH_API_KEY\` (Your OpenAI API Key)
3. **Anthropic**
   - **Provider:** \`anthropic\` | **Model:** \`claude-3-5-sonnet-20241022\`
   - **Env Var:** \`VOUCH_API_KEY\`
4. **Google Gemini**
   - **Provider:** \`google\` | **Model:** \`gemini-2.0-flash\`
   - **Env Var:** \`VOUCH_API_KEY\`

---

## 5. Running Tests from the CLI

You can bypass the interactive menu and run tests directly in CI/CD environments or scripts.

### Basic Run
```bash
vouch run examples/login.vch
```

### Overriding Configuration via Flags
You can override \`vouch.config.json\` directly from the terminal:

```bash
vouch run tests/checkout.vch \
  --provider openai \
  --model gpt-4o \
  --api-key sk-xxxxxx \
  --headless \
  --retries 5 \
  --viewport 1920x1080
```

---

## 6. Output Artifacts

By default, Vouch generates rich artifacts to help you debug test runs. These are stored in a hidden \`.vouch/\` folder to keep your project clean.

- **Reports (`.vch/reports/`)**: 
  A JSON file is generated per test run detailing every step taken, the exact coordinates clicked, the time it took, and whether it succeeded or failed.
- **Videos (`.vch/videos/`)**: 
  When \`recordVideo\` is true, a full `.mp4` recording of the browser session is saved. This works even when \`headless\` is set to true!

---

## 7. Understanding the Actor-Critic Loop

Vouch doesn't just blindly click things. It uses an **Actor-Critic AI architecture**:

1. **Actor Phase:** Vouch captures a 50% JPEG buffer of the web page viewport and sends it to the VLM. The AI maps your instruction to the exact bounding box and pixel coordinates of an element.
2. **Action Phase:** Vouch physically moves the mouse to the pixels and executes the click or keystroke.
3. **Critic Phase:** If you use an \`@assert\` command, or if the form validation fails (e.g., a visible red error appears saying "Password too short"), Vouch's Critic kicks in. The Critic evaluates the failure, rewrites the history ledger, and **automatically retries** the step with a corrected strategy.

Because Vouch operates purely visually, if a human can figure out how to interact with the UI, Vouch can too!
