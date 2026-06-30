import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { VouchConfig } from "../types/index.js";
import { loadConfig, runTestFile, validateTestFile } from "./runner.js";
import { initProject } from "./init.js";
import { runInteractiveMenu } from "./interactive.js";
import { createLogger, loadLoggerDeps } from "./logger.js";

/** Read version from package.json at build-root so CLI always matches published version */
function getPackageVersion(): string {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    // Walk up from dist/ or src/ to find package.json
    let dir = __dirname;
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(dir, "package.json");
      if (fs.existsSync(candidate)) {
        const pkg = JSON.parse(fs.readFileSync(candidate, "utf-8"));
        return pkg.version ?? "0.0.0";
      }
      dir = path.dirname(dir);
    }
  } catch {
    // Fallback silently
  }
  return "0.0.0";
}

async function ensureConfigExists() {
  if (!fs.existsSync("vouch.config.json")) {
    await initProject(true);
  }
}

export function createCLI(): Command {
  const program = new Command();

  program
    .name("vouch")
    .description("🕸️ Vouch — Zero-selector, AI vision-driven browser automation")
    .version(getPackageVersion(), "-v, --version", "Display the current Vouch version");

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
    .option("--dry-run", "Parse and validate the test file without executing it")
    .option("--verbose", "Enable verbose logging (shows AI reasoning, coordinates, and timing breakdown)")
    .action(async (file: string, options: Record<string, unknown>) => {
      await ensureConfigExists();
      await loadLoggerDeps();
      const chalk = await import("chalk");
      const boxen = await import("boxen");

      const c = chalk.default ?? chalk;
      const b = boxen.default ?? boxen;

      if (options.dryRun) {
        console.log(c.dim(`\nValidating ${file}...\n`));
        const validation = validateTestFile(file);
        if (validation.valid) {
          console.log(c.green(`✓ Valid .vch file (${validation.suite.steps.length} steps)`));
          process.exit(0);
        } else {
          console.log(c.red(`✗ Validation failed:\n${validation.error}`));
          process.exit(1);
        }
      }

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
      if (options.verbose) overrides.verbose = true;
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
      if (config.verbose) logger.info(c.yellow("Verbose mode enabled"));

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
