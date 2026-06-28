import type {
  HistoryEntry,
  StepResult,
  TestStep,
  VisionQAAction,
  VouchConfig,
} from "../types/index";
import { VisionQAEngine } from "../engine/vision.js";
import { BrowserController } from "../browser/controller.js";

/**
 * Actor-Critic Action Coordinator.
 * Highly optimized for ultra-low latency AI interactions via the Accessibility Tree.
 */
export class ActionCoordinator {
  private readonly engine: VisionQAEngine;
  private readonly browser: BrowserController;
  private readonly config: VouchConfig;

  constructor(
    engine: VisionQAEngine,
    browser: BrowserController,
    config: VouchConfig,
  ) {
    this.engine = engine;
    this.browser = browser;
    this.config = config;
  }

  /**
   * Execute a single test step with deterministic self-healing retries.
   * Time Complexity per attempt: O(N) where N is the depth of the AX Tree.
   * Space Complexity: O(M) where M is the history allocation ledger size.
   */
  async executeStep(
    step: TestStep,
    isLastStep: boolean,
    initialCriticFeedback?: string,
  ): Promise<StepResult> {
    const startTime = Date.now();
    const history: HistoryEntry[] = [];
    let currentCriticFeedback = initialCriticFeedback;

    if (step.type === "comment") {
      return { step, status: "skipped", duration: 0, attempts: [] };
    }

    if (step.type === "navigate") {
      try {
        const url = step.meta?.url ?? step.instruction;
        await this.browser.navigate(url);
        return {
          step,
          status: "passed",
          duration: Date.now() - startTime,
          attempts: [],
        };
      } catch (err) {
        return {
          step,
          status: "failed",
          duration: Date.now() - startTime,
          attempts: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    if (step.type === "wait") {
      const ms = parseInt(step.meta?.duration ?? "2000", 10);
      await this.browser.wait(ms);
      return {
        step,
        status: "passed",
        duration: Date.now() - startTime,
        attempts: [],
      };
    }

    // Main Actor-Critic Loop Execution Strategy
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Enforce network settling and UI rendering stabilization buffers before reading tree
        if (attempt > 1) {
          await this.browser.wait(this.config.actionDelay * attempt);
        }

        const imageBuffer = await this.browser.captureViewport();

        let instruction =
          step.type === "assert"
            ? `ASSERTION: "${step.instruction}". Carefully read the UI viewport image. If condition is visibly true, action="complete". If false/missing, action="fail". DO NOT guess.`
            : step.instruction;

        if (currentCriticFeedback) {
          instruction += `\nCRITIC FEEDBACK FROM PREVIOUS ATTEMPT: ${currentCriticFeedback}`;
        }

        const response = await this.engine.analyze(
          instruction,
          imageBuffer,
          history,
        );

        const hasComplete = response.actions.some(
          (a) => a.action === "complete",
        );
        const hasFail = response.actions.some((a) => a.action === "fail");

        const entry: HistoryEntry = {
          attempt,
          action: response.actions[0]?.action ?? "fail",
          x: response.actions[0]?.x ?? 0,
          y: response.actions[0]?.y ?? 0,
          textPayload: response.actions[0]?.textPayload || undefined,
          timestamp: Date.now(),
          success: false,
          detectedValidationError:
            response.detectedValidationError || undefined,
        };

        if (hasComplete) {
          entry.success = true;
          history.push(entry);
          return {
            step,
            status: "passed",
            duration: Date.now() - startTime,
            attempts: history,
          };
        }

        if (hasFail) {
          entry.success = false;
          entry.error = response.reasoning;
          history.push(entry);

          currentCriticFeedback = `Action engine failed explicitly. Reason: ${response.reasoning}`;
          continue;
        }

        if (step.type === "assert") {
          entry.success = false;
          entry.error = `Invalid action for assert step: "${response.actions[0]?.action}". Assert steps must evaluate to "complete" or "fail".`;
          history.push(entry);
          currentCriticFeedback = entry.error;
          continue;
        }

        // Execute actions with fresh context mutation awareness
        for (const action of response.actions) {
          if (action.action === "wait") {
            continue;
          }
          await this.dispatchAction(action, step);
          await this.browser.wait(this.config.actionDelay);
        }

        // Let the UI finish reacting/loading before we proceed to next step
        await this.browser.waitForVisualSettle(2000);

        if (response.detectedValidationError) {
          entry.success = false;
          entry.error = `Validation error: ${response.detectedValidationError}`;
          history.push(entry);
          currentCriticFeedback = `The element interacted with raised a validation error: ${response.detectedValidationError}. Choose a different parameter or fix the field constraint.`;
          continue;
        }

        entry.success = true;
        history.push(entry);

        // Break early if action is structurally verified
        return {
          step,
          status: "passed",
          duration: Date.now() - startTime,
          attempts: history,
        };
      } catch (err) {
        const runtimeError = err instanceof Error ? err.message : String(err);
        history.push({
          attempt,
          action: "fail",
          x: 0,
          y: 0,
          timestamp: Date.now(),
          success: false,
          error: runtimeError,
        });
        currentCriticFeedback = `Runtime Execution Exception: ${runtimeError}`;
      }
    }

    return {
      step,
      status: "failed",
      duration: Date.now() - startTime,
      attempts: history,
      error:
        `Step execution failed after exhausting ${this.config.maxRetries} loops.\n` +
        history
          .filter((h) => h.error)
          .map((h) => `     └─ [Attempt ${h.attempt}]: ${h.error}`)
          .join("\n"),
    };
  }

  /**
   * Dispatches exact side-effects to the CDP wrapper.
   * Leverages precise bounding box heuristics over unreliable model predictions.
   */
  private async dispatchAction(
    response: VisionQAAction,
    step: TestStep,
  ): Promise<void> {
    const { width, height } = this.browser.getViewportSize();

    const coords = this.engine.toPixelCoords(
      response.x,
      response.y,
      width,
      height,
    );
    const pixelX = coords.pixelX;
    const pixelY = coords.pixelY;

    const page = this.browser.getPage();

    try {
      switch (response.action) {
        case "click":
        case "select":
        case "fill":
          if (response.action === "fill" && response.textPayload) {
            await this.browser.type(pixelX, pixelY, response.textPayload);
          } else {
            await this.browser.click(pixelX, pixelY);
          }
          break;
        case "doubleClick":
          await this.browser.doubleClick(pixelX, pixelY);
          break;
        case "type":
          if (!response.textPayload) {
            throw new Error(
              `Action payload error: Attempted action "type" without textPayload content.`,
            );
          }
          await this.browser.type(pixelX, pixelY, response.textPayload);
          break;
        case "wait":
          await this.browser.wait(2000);
          break;
        case "scroll":
          await page.mouse.wheel(0, response.y > 500 ? 300 : -300);
          break;
        case "hover":
          await page.mouse.move(pixelX, pixelY);
          break;
        case "keypress":
          if (!response.textPayload) {
            throw new Error(
              `Action payload error: Keypress instruction received with empty payload token.`,
            );
          }
          await page.keyboard.press(response.textPayload as any);
          break;
        case "upload":
          throw new Error(
            "Upload action is disabled in pure vision-canvas architecture.",
          );
        default:
          throw new Error(
            `Unsupported Action Exception: The VisionQA Engine emitted target action "${response.action}" which has no valid execution strategy.`,
          );
      }
    } finally {
      // Clean up resources if necessary in future
    }
  }
}
