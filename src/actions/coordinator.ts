import * as fs from "node:fs";
import * as path from "node:path";
import type {
  HistoryEntry,
  StepResult,
  TestStep,
  VisionQAResponse,
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

        const screenReader = await this.browser.getScreenReaderOutput();

        let instruction =
          step.type === "assert"
            ? `ASSERTION: "${step.instruction}". Carefully read the UI tree. If condition is visibly true, action="complete". If false/missing, action="fail". DO NOT guess.`
            : step.instruction;

        if (currentCriticFeedback) {
          instruction += `\nCRITIC FEEDBACK FROM PREVIOUS ATTEMPT: ${currentCriticFeedback}`;
        }

        const response = await this.engine.analyze(
          instruction,
          screenReader,
          history,
        );

        const entry: HistoryEntry = {
          attempt,
          action: response.action,
          x: response.x,
          y: response.y,
          textPayload: response.textPayload || undefined,
          timestamp: Date.now(),
          success: false,
          detectedValidationError:
            response.detectedValidationError || undefined,
        };

        if (response.action === "complete") {
          entry.success = true;
          history.push(entry);
          return {
            step,
            status: "passed",
            duration: Date.now() - startTime,
            attempts: history,
          };
        }

        if (response.action === "fail") {
          entry.success = false;
          entry.error = response.reasoning;
          history.push(entry);

          currentCriticFeedback = `Action engine failed explicitly. Reason: ${response.reasoning}`;
          continue;
        }

        if (step.type === "assert") {
          entry.success = false;
          entry.error = `Invalid action for assert step: "${response.action}". Assert steps must evaluate to "complete" or "fail".`;
          history.push(entry);
          currentCriticFeedback = entry.error;
          continue;
        }

        // Execute action with fresh context mutation awareness
        await this.dispatchAction(response, step);
        await this.browser.wait(this.config.actionDelay);

        if (response.detectedValidationError) {
          entry.success = false;
          entry.error = `Validation error: ${response.detectedValidationError}`;
          history.push(entry);
          currentCriticFeedback = `The element interacted with raised a validation error: ${response.detectedValidationError}. Choose a different parameter or fix the field constraint.`;
          continue;
        }

        if (response.action === "wait") {
          entry.success = true;
          history.push(entry);
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
      error: `Step execution failed after exhausting ${this.config.maxRetries} loops. Key Ledger Faults: ${history
        .filter((h) => h.error)
        .map((h) => `[Attempt ${h.attempt}]: ${h.error}`)
        .join(" | ")}`,
    };
  }

  /**
   * Dispatches exact side-effects to the CDP wrapper.
   * Leverages precise bounding box heuristics over unreliable model predictions.
   */
  private async dispatchAction(
    response: VisionQAResponse,
    step: TestStep,
  ): Promise<void> {
    const { width, height } = this.browser.getViewportSize();
    let pixelX: number;
    let pixelY: number;

    const targetQuery = response.targetElement || step.instruction;
    const resolved = this.browser.resolveElement(targetQuery);

    if (resolved) {
      pixelX = Math.round((resolved.normX / 1000) * width);
      pixelY = Math.round((resolved.normY / 1000) * height);
    } else {
      const coords = this.engine.toPixelCoords(
        response.x,
        response.y,
        width,
        height,
      );
      pixelX = coords.pixelX;
      pixelY = coords.pixelY;
    }

    const page = this.browser.getPage();
    let elementHandle: any = null;

    try {
      elementHandle = await page
        .evaluateHandle(
          (x, y) => document.elementFromPoint(x, y),
          pixelX,
          pixelY,
        )
        .catch(() => null);

      switch (response.action) {
        case "click":
        case "select":
          await this.browser.click(pixelX, pixelY);
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
          await page.mouse.wheel({ deltaY: response.y > 500 ? 300 : -300 });
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
          if (elementHandle && response.textPayload) {
            const fileInput = await elementHandle.asElement();
            if (fileInput) {
              await fileInput.uploadFile(response.textPayload);
            } else {
              await this.browser.click(pixelX, pixelY);
            }
          } else {
            throw new Error(
              `Upload execution failed: Missing valid DOM target handle or local path payload alignment.`,
            );
          }
          break;
        default:
          throw new Error(
            `Unsupported Action Exception: The VisionQA Engine emitted target action "${response.action}" which has no valid execution strategy.`,
          );
      }
    } finally {
      if (elementHandle) {
        await elementHandle.dispose().catch(() => {});
      }
    }
  }
}
