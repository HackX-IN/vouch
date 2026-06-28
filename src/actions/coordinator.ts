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
 *
 * Flow per step:
 * 1. Screen reader → AI analysis → execute action → repeat
 * 2. Actor-Critic loop for automatic self-healing
 */
export class ActionCoordinator {
  private engine: VisionQAEngine;
  private browser: BrowserController;
  private config: VouchConfig;

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
   * Execute a single test step with self-healing retries.
   */
  async executeStep(step: TestStep, isLastStep: boolean, criticFeedback?: string): Promise<StepResult> {
    const startTime = Date.now();
    const history: HistoryEntry[] = [];

    // Handle special step types
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

    // For action, assert, and conditional steps: Actor-Critic loop
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        // 1. Read the page via screen reader (accessibility API)
        const screenReader = await this.browser.getScreenReaderOutput();

        // 2. Format instruction based on step type
        let instruction =
          step.type === "assert"
            ? `ASSERTION: "${step.instruction}". Carefully read the UI tree. If condition is visibly true, action="complete". If false/missing, action="fail". DO NOT guess.`
            : step.instruction;
            
        if (criticFeedback) {
          instruction += `\nCRITIC FEEDBACK FROM PREVIOUS ATTEMPT: ${criticFeedback}`;
        }

        // 3. Send to VisionQA engine
        const response = await this.engine.analyze(
          instruction,
          screenReader,
          history,
        );

        // 3. Build history entry
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

        // 4. Terminal: complete
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

        // 5. Terminal: fail
        if (response.action === "fail") {
          entry.success = false;
          entry.error = response.reasoning;
          history.push(entry);

          if (attempt < this.config.maxRetries) {
            await this.browser.wait(this.config.actionDelay);
            continue;
          }

          return {
            step,
            status: "failed",
            duration: Date.now() - startTime,
            attempts: history,
            error: response.reasoning,
          };
        }

        // 6. If this is an assert step, it MUST respond complete or fail.
        if (step.type === "assert") {
          entry.success = false;
          entry.error = `Invalid action for assert step: "${response.action}". You must respond "complete" or "fail".`;
          history.push(entry);
          continue;
        }

        // 7. Execute the action for non-assert steps
        await this.dispatchAction(response, step);

        // 8. Post-action delay
        await this.browser.wait(this.config.actionDelay);

        // 9. Check for validation errors (Critic phase)
        if (response.detectedValidationError) {
          entry.success = false;
          entry.error = `Validation error: ${response.detectedValidationError}`;
          history.push(entry);
          continue; // Retry — AI will self-heal from the history
        }

        // 10. Wait action → re-evaluate
        if (response.action === "wait") {
          entry.success = true;
          history.push(entry);
          continue;
        }

        // 11. Mark success for action step
        entry.success = true;
        history.push(entry);

        return {
          step,
          status: "passed",
          duration: Date.now() - startTime,
          attempts: history,
        };
      } catch (err) {
        history.push({
          attempt,
          action: "fail",
          x: 0,
          y: 0,
          timestamp: Date.now(),
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // All retries exhausted
    return {
      step,
      status: "failed",
      duration: Date.now() - startTime,
      attempts: history,
      error: `Step failed after ${this.config.maxRetries} attempts. Last errors: ${history
        .filter((h) => h.error)
        .map((h) => h.error)
        .join(" | ")}`,
    };
  }

  /**
   * Dispatch any action to the browser — extensible, not a fixed set.
   * 
   * Smart Element Resolution: If the AI provides a targetElement name,
   * we look up its real coordinates from the AX tree cache instead of
   * trusting the model's guessed x,y. This makes small models reliable.
   */
  private async dispatchAction(response: VisionQAResponse, step: TestStep): Promise<void> {
    const { width, height } = this.browser.getViewportSize();
    
    // Smart resolution: prefer element name lookup over raw coordinates
    let pixelX: number;
    let pixelY: number;
    
    // First try the model's targetElement, then fallback to fuzzy matching the step instruction itself
    const targetQuery = response.targetElement || step.instruction;
    const resolved = this.browser.resolveElement(targetQuery);
    
    if (resolved) {
      // Use the real coordinates from the AX tree
      pixelX = Math.round((resolved.normX / 1000) * width);
      pixelY = Math.round((resolved.normY / 1000) * height);
    } else {
      // Fallback to model's guessed coordinates
      const coords = this.engine.toPixelCoords(response.x, response.y, width, height);
      pixelX = coords.pixelX;
      pixelY = coords.pixelY;
    }
    
    const page = this.browser.getPage();

    // 1. Resolve the exact DOM element at these coordinates for smarter interaction
    const elementHandle = await page
      .evaluateHandle((x, y) => document.elementFromPoint(x, y), pixelX, pixelY)
      .catch(() => null);

    switch (response.action) {
      case "click":
        await this.browser.click(pixelX, pixelY);
        break;
      case "type":
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
        await page.keyboard.press(response.textPayload as any);
        break;
      case "select":
        // Click to open, then click the option
        await this.browser.click(pixelX, pixelY);
        break;
      case "upload":
        // File inputs cannot be clicked normally to upload files via code, it opens an OS dialog.
        // We MUST use the ElementHandle to upload the file directly.
        if (elementHandle && response.textPayload) {
          const el =
            elementHandle.asElement() as unknown as import("puppeteer").ElementHandle<HTMLInputElement>;
          if (el) {
            await el.uploadFile(response.textPayload);
          } else {
            // Fallback
            await this.browser.click(pixelX, pixelY);
          }
        }
        break;
      default:
        // For any unknown action, try to click at the coordinates
        await this.browser.click(pixelX, pixelY);
        break;
    }

    // Cleanup handle to prevent memory leaks
    if (elementHandle) {
      await elementHandle.dispose().catch(() => {});
    }
  }
}
