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

        const isNavigationalOnly = response.actions.every(
          (a) => a.action === "scroll" || a.action === "hover" || a.action === "wait"
        );

        const isExplicitNavCommand = /^(scroll|hover|wait)/i.test(step.instruction.trim());

        if (isNavigationalOnly && !hasComplete && !isExplicitNavCommand) {
          entry.success = false;
          entry.error = `Action was purely navigational. Instruction not yet completed.`;
          history.push(entry);
          currentCriticFeedback = `You scrolled/hovered but did not finish the instruction. Examine the new viewport to find the target, or scroll again.`;
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

    if (pixelX < 0 || pixelX > width || pixelY < 0 || pixelY > height) {
      throw new Error(
        `Coordinate hallucination detected: Action targets (${pixelX}, ${pixelY}) which is outside viewport dimensions (${width}x${height}).`
      );
    }

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
        case "scroll": {
          const instruction = step.instruction.toLowerCase();
          
          // Handle absolute scrolling
          if (instruction.includes("bottom") || instruction.includes("complete down")) {
            await page.evaluate(async () => {
              window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
              await new Promise((resolve) => setTimeout(resolve, 800));
            });
            break;
          }
          if (instruction.includes("top") || instruction.includes("complete up")) {
            await page.evaluate(async () => {
              window.scrollTo({ top: 0, behavior: "smooth" });
              await new Promise((resolve) => setTimeout(resolve, 800));
            });
            break;
          }

          const scrollMatch = step.instruction.match(/(\d+)/);
          let scrollAmount = 300; // default 300px
          if (scrollMatch && scrollMatch[1]) {
            scrollAmount = parseInt(scrollMatch[1], 10);
          }
          
          // Override VLM y-axis logic if explicit direction is provided
          const isUp = instruction.includes("up");
          const isDown = instruction.includes("down");
          let direction = response.y > 500 ? 1 : -1;
          if (isUp) direction = -1;
          if (isDown) direction = 1;

          await page.mouse.wheel(0, direction * scrollAmount);
          break;
        }
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
