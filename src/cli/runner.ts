import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
const execAsync = promisify(exec);

import type { TestRunResult, TestSuite, VouchConfig } from "../types/index";
import { DEFAULT_CONFIG } from "../types/index";
import { VisionQAEngine } from "../engine/vision.js";
import { BrowserController } from "../browser/controller.js";
import { ActionCoordinator } from "../actions/coordinator.js";
import { parseVchFile } from "../parser/vch-parser.js";
import { generateJSONReport } from "../reporter/json-reporter.js";

/**
 * Loads and merges configuration from:
 * 1. Default config
 * 2. vouch.config.json (if present)
 * 3. Environment variables
 * 4. CLI overrides
 * CI mode forces headless + screenshotOnFailure, disables video recording.
 */
export function loadConfig(overrides: Partial<VouchConfig> = {}): VouchConfig {
  let fileConfig: Partial<VouchConfig> = {};

  const configPath = path.resolve("vouch.config.json");
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      fileConfig = JSON.parse(raw);
    } catch {
      // Ignore malformed config
    }
  }

  const envConfig: Partial<VouchConfig> = {};
  if (process.env.VOUCH_PROVIDER)
    envConfig.provider = process.env.VOUCH_PROVIDER as VouchConfig["provider"];
  if (process.env.VOUCH_MODEL) envConfig.model = process.env.VOUCH_MODEL;
  if (process.env.VOUCH_API_KEY) envConfig.apiKey = process.env.VOUCH_API_KEY;
  if (process.env.VOUCH_BASE_URL) envConfig.baseUrl = process.env.VOUCH_BASE_URL;
  if (process.env.VOUCH_HEADLESS) envConfig.headless = process.env.VOUCH_HEADLESS === "true";
  if (process.env.VOUCH_RETRIES) {
    const n = parseInt(process.env.VOUCH_RETRIES, 10);
    if (!isNaN(n)) envConfig.maxRetries = n;
  }
  if (process.env.VOUCH_TIMEOUT) {
    const n = parseInt(process.env.VOUCH_TIMEOUT, 10);
    if (!isNaN(n)) envConfig.stepTimeout = n;
  }
  if (process.env.VOUCH_VERBOSE) envConfig.verbose = process.env.VOUCH_VERBOSE === "true";
  if (process.env.VOUCH_CI) envConfig.ci = process.env.VOUCH_CI === "true";

  const merged: VouchConfig = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...envConfig,
    ...overrides,
  };

  // CI mode overrides: force headless, disable video, enable report + failure screenshots
  if (merged.ci) {
    merged.headless = true;
    merged.recordVideo = false;
    merged.consolidateVideo = false;
    merged.report = true;
    merged.screenshotOnFailure = true;
  }

  return merged;
}

/**
 * Validates a .vch file without executing it (dry-run mode).
 */
export function validateTestFile(filePath: string): {
  suite: TestSuite;
  valid: boolean;
  error?: string;
} {
  try {
    const suite = parseVchFile(filePath);
    return { suite, valid: true };
  } catch (err) {
    return {
      suite: { name: "", filePath, steps: [] },
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Core test runner — orchestrates the full test execution lifecycle for a single file.
 */
export async function runTestFile(
  filePath: string,
  config: VouchConfig,
  logger: Logger,
): Promise<TestRunResult> {
  const suite = parseVchFile(filePath);
  logger.suiteStart(suite);

  const engine = new VisionQAEngine(config);
  const browser = new BrowserController(config);
  const coordinator = new ActionCoordinator(engine, browser, config);

  const result: TestRunResult = {
    suite,
    results: [],
    startTime: Date.now(),
    endTime: 0,
    totalPassed: 0,
    totalFailed: 0,
    totalSkipped: 0,
  };

  let totalInferenceMs = 0;
  let totalExecutionMs = 0;

  try {
    logger.info("Launching browser...");
    await browser.launch();
    logger.info("Browser ready.");

    const actionSteps = suite.steps.filter(s => s.type !== "comment" && s.type !== "conditional_end");
    let criticFeedback: string | undefined = undefined;
    let backtrackCount = 0;
    const MAX_BACKTRACKS = config.maxRetries;
    let skipUntilEndif = false;
    const executedIndices: number[] = [];

    for (let i = 0; i < suite.steps.length; i++) {
      const step = suite.steps[i];
      const isLastActionStep = step === actionSteps[actionSteps.length - 1];

      // Skip block when @if condition was false
      if (skipUntilEndif) {
        if (step.type === "conditional_end") skipUntilEndif = false;
        const skipResult: import("../types/index").StepResult = { step, status: "skipped", duration: 0, attempts: [] };
        result.results.push(skipResult);
        result.totalSkipped++;
        logger.stepStart(step);
        logger.stepEnd(skipResult);
        continue;
      }

      // @endif closer when condition was true — structural only
      if (step.type === "conditional_end") {
        const skipResult: import("../types/index").StepResult = { step, status: "skipped", duration: 0, attempts: [] };
        result.results.push(skipResult);
        result.totalSkipped++;
        logger.stepStart(step);
        logger.stepEnd(skipResult);
        continue;
      }

      if (!criticFeedback) logger.stepStart(step);

      const stepResult = await coordinator.executeStep(step, isLastActionStep, criticFeedback);
      criticFeedback = undefined;

      if (stepResult.timing) {
        totalInferenceMs += stepResult.timing.totalInferenceMs;
        totalExecutionMs += stepResult.timing.totalExecutionMs;
      }

      if (stepResult.status === "failed") {
        // @if condition false → skip block
        if (step.type === "conditional") {
          skipUntilEndif = true;
          const skipBranchResult: import("../types/index").StepResult = { ...stepResult, status: "skipped" };
          result.results.push(skipBranchResult);
          result.totalSkipped++;
          logger.stepEnd(skipBranchResult);
          continue;
        }

        // Auto-backtrack on failed assertions
        if (step.type === "assert" && backtrackCount < MAX_BACKTRACKS) {
          let backtrackTargetIndex = -1;
          for (let k = executedIndices.length - 1; k >= 0; k--) {
            const candidateIdx = executedIndices[k];
            const candidate = suite.steps[candidateIdx];
            if (candidate.type === "action" && candidateIdx !== i) {
              backtrackTargetIndex = candidateIdx;
              break;
            }
          }
          if (backtrackTargetIndex >= 0) {
            backtrackCount++;
            logger.stepEnd({ step, status: "skipped", duration: 0, attempts: [] });
            logger.info(
              `\n  › Assertion failed. Auto-healing by backtracking to previous action (Attempt ${backtrackCount}/${MAX_BACKTRACKS})...`,
            );
            criticFeedback = `Your previous action failed to satisfy this assertion: "${step.instruction}". You MUST try clicking a completely DIFFERENT element or coordinate this time.`;
            i = backtrackTargetIndex - 1;
            continue;
          }
        }

        result.results.push(stepResult);
        result.totalFailed++;
        logger.stepEnd(stepResult);
        continue;
      }

      if (step.type === "action" || step.type === "conditional") {
        executedIndices.push(i);
      }

      result.results.push(stepResult);
      if (stepResult.status === "passed") result.totalPassed++;
      if (stepResult.status === "skipped") result.totalSkipped++;
      logger.stepEnd(stepResult);
    }
  } catch (err) {
    logger.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await browser.close();
    logger.info("Browser closed.");

    const video = browser.getVideoPath();
    if (video) {
      const finalVideoPath = path.resolve(video);
      logger.info(`Video saved: ${finalVideoPath}`);

      if (config.consolidateVideo) {
        try {
          logger.info("Consolidating video (removing idle VLM inference time)...");
          const fastVideoPath = `${finalVideoPath}.fast.webm`;
          await execAsync(
            `ffmpeg -i "${finalVideoPath}" -vf "mpdecimate,setpts=N/FRAME_RATE/TB" -y "${fastVideoPath}"`,
          );
          fs.renameSync(fastVideoPath, finalVideoPath);
          logger.info("Video successfully consolidated!");
        } catch {
          logger.info("Note: Install FFmpeg to automatically fast-forward execution videos.");
        }
      }
    }

    const trace = browser.getTracePath();
    if (trace) {
      logger.info(`Trace saved: ${path.resolve(trace)}`);
      logger.info(`Run 'npx playwright show-trace ${trace}' to view interactive playback.`);
    }

    const failureScreenshots = result.results.filter(r => r.failureScreenshot);
    if (failureScreenshots.length > 0) {
      logger.info(
        `${failureScreenshots.length} failure screenshot(s) saved to: ${path.resolve(config.screenshotDir)}`,
      );
    }
  }

  result.endTime = Date.now();
  result.timing = { totalInferenceMs, totalExecutionMs };

  if (config.report) {
    const reportPayload = {
      ...result,
      suite: { name: result.suite.name, filePath: result.suite.filePath },
    };
    const reportFile = generateJSONReport(reportPayload, config.reportDir, config);
    logger.info(`Report generated: ${path.resolve(reportFile)}`);
  }

  logger.suiteEnd(result);
  return result;
}

/**
 * Runs multiple .vch files with a configurable concurrency limit.
 * Returns aggregate totals across all test files.
 */
export async function runAllTestFiles(
  filePaths: string[],
  config: VouchConfig,
  logger: Logger,
  concurrency = 1,
): Promise<{ results: TestRunResult[]; totalPassed: number; totalFailed: number }> {
  const results: TestRunResult[] = [];
  let totalPassed = 0;
  let totalFailed = 0;

  // Process files in batches of `concurrency`
  for (let i = 0; i < filePaths.length; i += concurrency) {
    const batch = filePaths.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(fp => runTestFile(fp, config, logger)),
    );
    for (const r of batchResults) {
      results.push(r);
      totalPassed += r.totalPassed;
      totalFailed += r.totalFailed;
    }
  }

  return { results, totalPassed, totalFailed };
}

// ─── Logger Interface ────────────────────────────────────────────────

export interface Logger {
  info(msg: string): void;
  error(msg: string): void;
  suiteStart(suite: TestSuite): void;
  suiteEnd(result: TestRunResult): void;
  stepStart(step: import("../types/index").TestStep): void;
  stepEnd(result: import("../types/index").StepResult): void;
}
