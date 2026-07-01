import * as fs from "node:fs";
import * as path from "node:path";
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
 * Features: screenshot-on-failure, inference timing, temperature decay via providers.
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
   */
  async executeStep(
    step: TestStep,
    isLastStep: boolean,
    initialCriticFeedback?: string,
  ): Promise<StepResult> {
    const startTime = Date.now();
    const history: HistoryEntry[] = [];
    let currentCriticFeedback = initialCriticFeedback;
    let totalInferenceMs = 0;

    if (step.type === "comment" || step.type === "conditional_end") {
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
        const result: StepResult = {
          step,
          status: "failed",
          duration: Date.now() - startTime,
          attempts: [],
          error: err instanceof Error ? err.message : String(err),
        };
        result.failureScreenshot = await this.saveFailureScreenshot(step);
        return result;
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

    // @screenshot — save a named screenshot of the current viewport
    if (step.type === "screenshot") {
      try {
        const name = step.meta?.name ?? `screenshot-L${step.lineNumber}`;
        const dir = this.config.screenshotDir;
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filePath = path.join(dir, `${name}-${timestamp}.png`);
        await this.browser.saveScreenshot(filePath);
        return {
          step,
          status: "passed",
          duration: Date.now() - startTime,
          attempts: [],
          screenshotPath: filePath,
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

    // Main Actor-Critic Loop
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          await this.browser.wait(this.config.actionDelay * attempt);
        }

        if (step.type === "conditional" && attempt === 1) {
          await this.browser.waitForVisualSettle(1500);
        }

        const isAssertionLike = step.type === "assert" || step.type === "conditional";
        const { buffer: imageBuffer, mimeType } = await this.browser.captureViewport(
          isAssertionLike ? "assertion" : "action",
        );

        let instruction = isAssertionLike
          ? `ASSERTION: "${step.instruction}". Carefully read the UI viewport image. If condition is visibly true, action="complete". If false/missing, action="fail". DO NOT guess.`
          : step.instruction;

        if (currentCriticFeedback) {
          instruction += `\nCRITIC FEEDBACK FROM PREVIOUS ATTEMPT: ${currentCriticFeedback}`;
        }

        const response = await this.engine.analyze(
          instruction,
          imageBuffer,
          history,
          isAssertionLike,
          mimeType,
        );

        const inferenceMs = response.inferenceTimeMs ?? 0;
        totalInferenceMs += inferenceMs;

        const hasComplete = response.actions.some(a => a.action === "complete");
        const hasFail = response.actions.some(a => a.action === "fail");

        const entry: HistoryEntry = {
          attempt,
          action: response.actions[0]?.action ?? "fail",
          x: response.actions[0]?.x ?? 0,
          y: response.actions[0]?.y ?? 0,
          textPayload: response.actions[0]?.textPayload || undefined,
          timestamp: Date.now(),
          success: false,
          detectedValidationError: response.detectedValidationError || undefined,
          inferenceTimeMs: inferenceMs,
        };

        if (hasComplete) {
          entry.success = true;
          history.push(entry);
          const totalDuration = Date.now() - startTime;
          return {
            step,
            status: "passed",
            duration: totalDuration,
            attempts: history,
            timing: {
              totalInferenceMs,
              totalExecutionMs: totalDuration - totalInferenceMs,
            },
          };
        }

        if (hasFail) {
          entry.success = false;
          entry.error = response.reasoning;
          history.push(entry);
          currentCriticFeedback = `Action engine failed explicitly. Reason: ${response.reasoning}`;
          continue;
        }

        if (step.type === "assert" || step.type === "conditional") {
          entry.success = false;
          entry.error = `Invalid action for ${step.type} step: "${response.actions[0]?.action}". These steps must evaluate to "complete" or "fail".`;
          history.push(entry);
          currentCriticFeedback = entry.error;
          continue;
        }

        // Execute actions
        for (const action of response.actions) {
          if (action.action === "wait") continue;
          await this.dispatchAction(action, step);
          await this.browser.wait(this.config.actionDelay);
        }

        await this.browser.waitForVisualSettle(1500);

        if (response.detectedValidationError) {
          entry.success = false;
          entry.error = `Validation error: ${response.detectedValidationError}`;
          history.push(entry);
          currentCriticFeedback = `The element interacted with raised a validation error: ${response.detectedValidationError}. Choose a different parameter or fix the field constraint.`;
          continue;
        }

        const isNavigationalOnly = response.actions.every(
          a => a.action === "scroll" || a.action === "hover" || a.action === "wait",
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
        const totalDuration = Date.now() - startTime;
        return {
          step,
          status: "passed",
          duration: totalDuration,
          attempts: history,
          timing: {
            totalInferenceMs,
            totalExecutionMs: totalDuration - totalInferenceMs,
          },
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

    const failureScreenshot =
      step.type === "conditional"
        ? undefined
        : await this.saveFailureScreenshot(step);
    const totalDuration = Date.now() - startTime;

    return {
      step,
      status: "failed",
      duration: totalDuration,
      attempts: history,
      failureScreenshot,
      timing: {
        totalInferenceMs,
        totalExecutionMs: totalDuration - totalInferenceMs,
      },
      error:
        `Step execution failed after exhausting ${this.config.maxRetries} loops.\n` +
        history
          .filter(h => h.error)
          .map(h => `     └─ [Attempt ${h.attempt}]: ${h.error}`)
          .join("\n"),
    };
  }

  private async saveFailureScreenshot(step: TestStep): Promise<string | undefined> {
    if (!this.config.screenshotOnFailure) return undefined;

    try {
      const dir = this.config.screenshotDir;
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeName = step.instruction.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50);
      const filename = `failure-L${step.lineNumber}-${safeName}-${timestamp}.png`;
      const filePath = path.join(dir, filename);

      const page = this.browser.getPage();
      await page.screenshot({ path: filePath, type: "png", fullPage: false });

      return filePath;
    } catch {
      return undefined;
    }
  }

  private async dispatchAction(response: VisionQAAction, step: TestStep): Promise<void> {
    const { width, height } = this.browser.getViewportSize();

    const coords = this.engine.toPixelCoords(response.x, response.y, width, height);
    const { pixelX, pixelY } = coords;

    if (pixelX < 0 || pixelX > width || pixelY < 0 || pixelY > height) {
      throw new Error(
        `Coordinate hallucination detected: Action targets (${pixelX}, ${pixelY}) which is outside viewport dimensions (${width}x${height}).`,
      );
    }

    const page = this.browser.getPage();
    const instruction = step.instruction.toLowerCase();

    switch (response.action) {
      case "click":
      case "select":
        await this.browser.click(pixelX, pixelY);
        break;

      case "fill":
        if (response.textPayload) {
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
        if (instruction.includes("bottom") || instruction.includes("complete down")) {
          await this.browser.scrollTo("bottom");
          break;
        }
        if (instruction.includes("top") || instruction.includes("complete up")) {
          await this.browser.scrollTo("top");
          break;
        }

        const scrollMatch = step.instruction.match(/(\d+)/);
        const scrollAmount = scrollMatch ? parseInt(scrollMatch[1], 10) : 300;

        const isUp = instruction.includes("up");
        const isDown = instruction.includes("down");
        let direction = response.y > 500 ? 1 : -1;
        if (isUp) direction = -1;
        if (isDown) direction = 1;

        await this.browser.scroll(pixelX, pixelY, 0, direction * scrollAmount);
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
          "Upload action is not supported in pure vision-canvas architecture.",
        );

      default:
        throw new Error(
          `Unsupported Action Exception: The VisionQA Engine emitted target action "${response.action}" which has no valid execution strategy.`,
        );
    }
  }
}
