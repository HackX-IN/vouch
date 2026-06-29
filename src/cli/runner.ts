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
 */
export function loadConfig(overrides: Partial<VouchConfig> = {}): VouchConfig {
  let fileConfig: Partial<VouchConfig> = {};

  // Try to load vouch.config.json from CWD
  const configPath = path.resolve("vouch.config.json");
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      fileConfig = JSON.parse(raw);
    } catch {
      // Ignore malformed config
    }
  }

  // Environment variable mappings
  const envConfig: Partial<VouchConfig> = {};
  if (process.env.VOUCH_PROVIDER)
    envConfig.provider = process.env.VOUCH_PROVIDER as VouchConfig["provider"];
  if (process.env.VOUCH_MODEL) envConfig.model = process.env.VOUCH_MODEL;
  if (process.env.VOUCH_API_KEY) envConfig.apiKey = process.env.VOUCH_API_KEY;
  if (process.env.VOUCH_BASE_URL)
    envConfig.baseUrl = process.env.VOUCH_BASE_URL;
  if (process.env.VOUCH_HEADLESS)
    envConfig.headless = process.env.VOUCH_HEADLESS === "true";

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...envConfig,
    ...overrides,
  };
}

/**
 * Core test runner — orchestrates the full test execution lifecycle.
 */
export async function runTestFile(
  filePath: string,
  config: VouchConfig,
  logger: Logger,
): Promise<TestRunResult> {
  // 1. Parse the test file
  const suite = parseVchFile(filePath);
  logger.suiteStart(suite);

  // 2. Initialize components
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

  try {
    // 3. Launch browser
    logger.info("Launching browser...");
    await browser.launch();
    logger.info("Browser ready.");

    // 4. Execute steps sequentially
    const actionSteps = suite.steps.filter((s) => s.type !== "comment");
    let criticFeedback: string | undefined = undefined;
    let backtrackCount = 0;
    const MAX_BACKTRACKS = config.maxRetries;

    for (let i = 0; i < suite.steps.length; i++) {
      const step = suite.steps[i];
      const isLastActionStep = step === actionSteps[actionSteps.length - 1];
      
      if (!criticFeedback) {
        logger.stepStart(step);
      }

      const stepResult = await coordinator.executeStep(step, isLastActionStep, criticFeedback);
      criticFeedback = undefined;

      if (stepResult.status === "failed") {
        // Backtrack Auto-Healing Logic
        if (step.type === "assert" && backtrackCount < MAX_BACKTRACKS) {
           let prevIndex = i - 1;
           while (prevIndex >= 0 && (suite.steps[prevIndex].type === "comment" || suite.steps[prevIndex].type === "wait")) {
             prevIndex--;
           }
           
           if (prevIndex >= 0 && suite.steps[prevIndex].type !== "assert" && suite.steps[prevIndex].type !== "navigate") {
             backtrackCount++;
             logger.info(`\n  › ⚠️ Assertion failed. Auto-healing by backtracking to previous action (Attempt ${backtrackCount}/${MAX_BACKTRACKS})...`);
             criticFeedback = `Your previous action failed to satisfy this assertion: "${step.instruction}". You MUST try clicking a completely DIFFERENT element or coordinate this time.`;
             i = prevIndex - 1; // -1 because the loop will do i++ next
             continue;
           }
        }

        result.results.push(stepResult);
        result.totalFailed++;
        logger.stepEnd(stepResult);
        continue; // Smartly move on to the next step on unrecoverable failure
      }

      // Reset backtrack counter if the step passed
      if (step.type === "assert") {
        backtrackCount = 0; 
      }

      result.results.push(stepResult);
      if (stepResult.status === "passed") result.totalPassed++;
      if (stepResult.status === "skipped") result.totalSkipped++;
      logger.stepEnd(stepResult);
    }
  } catch (err) {
    logger.error(
      `Fatal error: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    // 5. Close browser
    await browser.close();
    logger.info("Browser closed.");
    const video = browser.getVideoPath();
    if (video) {
      const finalVideoPath = path.resolve(video);
      logger.info(`Video saved: ${finalVideoPath}`);
      
      try {
        logger.info("Consolidating video (removing idle VLM inference time)...");
        const fastVideoPath = `${finalVideoPath}.fast.webm`;
        // mpdecimate drops duplicate/idle frames, setpts resets the timestamps to play smoothly
        await execAsync(`ffmpeg -i "${finalVideoPath}" -vf "mpdecimate,setpts=N/FRAME_RATE/TB" -y "${fastVideoPath}"`);
        fs.renameSync(fastVideoPath, finalVideoPath);
        logger.info("Video successfully consolidated!");
      } catch (e) {
        // FFmpeg is likely not installed or failed
        logger.info("Note: Install FFmpeg on your system to automatically fast-forward and consolidate execution videos.");
      }
    }
  }

  result.endTime = Date.now();

  // 6. Generate report
  if (config.report) {
    // Consolidate the report payload by removing redundant suite.steps
    const reportPayload = {
      ...result,
      suite: {
        name: result.suite.name,
        filePath: result.suite.filePath,
      },
    };
    const reportFile = generateJSONReport(reportPayload, config.reportDir, config);
    logger.info(`Report generated: ${path.resolve(reportFile)}`);
  }

  logger.suiteEnd(result);
  return result;
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
