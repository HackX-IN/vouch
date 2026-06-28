import * as fs from "node:fs";
import * as path from "node:path";
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
    for (let i = 0; i < suite.steps.length; i++) {
      const step = suite.steps[i];
      const isLastActionStep = step === actionSteps[actionSteps.length - 1];
      logger.stepStart(step);

      const stepResult = await coordinator.executeStep(step, isLastActionStep);
      result.results.push(stepResult);

      switch (stepResult.status) {
        case "passed":
          result.totalPassed++;
          break;
        case "failed":
          result.totalFailed++;
          break;
        case "skipped":
          result.totalSkipped++;
          break;
      }

      logger.stepEnd(stepResult);

      // If a critical step fails, we could choose to abort
      // For now, continue executing remaining steps
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
      logger.info(`Video saved: ${path.resolve(video)}`);
    }
  }

  result.endTime = Date.now();

  // 6. Generate report
  if (config.report) {
    const reportFile = generateJSONReport(result, config.reportDir);
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
