import { Command } from "commander";
import * as fs from "node:fs";
import type { VouchConfig } from "../types/index.js";
import { loadConfig, runTestFile } from "./runner.js";
import { initProject } from "./init.js";
import { runInteractiveMenu } from "./interactive.js";
import { createLogger, loadLoggerDeps } from "./logger.js";

async function ensureConfigExists() {
  if (!fs.existsSync("vouch.config.json")) {
    await initProject(true);
  }
}

export function createCLI(): Command {
  const program = new Command();

  program
    .name("vouch")
    .description("🕸️ Vouch — Zero-selector, vision-driven web automation")
    .version("1.0.0");

  program.action(async () => {
    await ensureConfigExists();
    await runInteractiveMenu();
  });

  program
    .command("run")
    .description("Execute a .vch file")
    .argument("<file>", "Path to the .vch file")
    .option(
      "-p, --provider <provider>",
      "AI provider (openai, anthropic, google, ollama)",
    )
    .option("-m, --model <model>", "AI model identifier")
    .option("-k, --api-key <key>", "API key for the AI provider")
    .option("--base-url <url>", "Base URL override")
    .option("--headless", "Run browser in headless mode")
    .option("--no-headless", "Run browser in headed mode")
    .option("--retries <n>", "Max retries per step", parseInt)
    .option("--viewport <WxH>", "Viewport size (e.g., 1280x800)")
    .option("--no-report", "Skip JSON report generation")
    .option("--report-dir <dir>", "JSON report output directory")
    .action(async (file: string, options: Record<string, unknown>) => {
      await ensureConfigExists();
      await loadLoggerDeps();
      const chalk = await import("chalk");
      const boxen = await import("boxen");

      const c = chalk.default ?? chalk;
      const b = boxen.default ?? boxen;

      console.log(
        b(c.bold.white("🕸️ VOUCH") + c.dim(" — Vision-Driven Automation"), {
          padding: { top: 0, bottom: 0, left: 2, right: 2 },
          borderStyle: "round",
          borderColor: "white",
          dimBorder: true,
        }),
      );

      const overrides: Partial<VouchConfig> = {};
      if (options.provider)
        overrides.provider = options.provider as VouchConfig["provider"];
      if (options.model) overrides.model = options.model as string;
      if (options.apiKey) overrides.apiKey = options.apiKey as string;
      if (options.baseUrl) overrides.baseUrl = options.baseUrl as string;
      if (typeof options.headless === "boolean")
        overrides.headless = options.headless;
      if (options.retries) overrides.maxRetries = options.retries as number;
      if (options.reportDir) overrides.reportDir = options.reportDir as string;
      if (options.report === false) overrides.report = false;
      if (options.viewport) {
        const [w, h] = (options.viewport as string).split("x").map(Number);
        if (w && h) {
          overrides.viewportWidth = w;
          overrides.viewportHeight = h;
        }
      }

      const config = loadConfig(overrides);
      const logger = createLogger(config);

      logger.info(
        `Provider: ${c.cyan(config.provider)} | Model: ${c.cyan(config.model)}`,
      );
      logger.info(
        `Viewport: ${config.viewportWidth}x${config.viewportHeight} | Headless: ${config.headless}`,
      );
      logger.info(
        `Max retries: ${config.maxRetries} | Action delay: ${config.actionDelay}ms`,
      );

      const result = await runTestFile(file, config, logger);
      process.exit(result.totalFailed > 0 ? 1 : 0);
    });

  program
    .command("init")
    .description("Initialize a new Vouch project with example files")
    .action(async () => {
      await loadLoggerDeps();
      await initProject(false);
    });

  return program;
}
