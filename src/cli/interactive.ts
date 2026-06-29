import * as fs from "node:fs";
import * as path from "node:path";
import { initProject } from "./init.js";
import { loadConfig, runTestFile } from "./runner.js";
import { createLogger, loadLoggerDeps } from "./logger.js";
import type { VouchConfig } from "../types/index.js";

function findVchFiles(dir: string, fileList: string[] = []): string[] {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (
        file === "node_modules" ||
        file === ".git" ||
        file === "dist" ||
        file === ".vouch" ||
        file.startsWith(".")
      )
        continue;
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        findVchFiles(fullPath, fileList);
      } else if (file.endsWith(".vch")) {
        fileList.push(fullPath);
      }
    }
  } catch (e) {
    // Ignore permissions/read errors
  }
  return fileList;
}

export async function runInteractiveMenu() {
  const chalk = await import("chalk");
  const p = await import("@clack/prompts");
  const c = chalk.default ?? chalk;

  console.clear();
  console.log(
    c.bold.white(`
 ▄▄   ▄▄ ▄▄▄▄▄▄▄ ▄▄   ▄▄ ▄▄▄▄▄▄▄ ▄▄   ▄▄
█  █ █  █       █  █ █  █       █  █ █  █
█  █ █  █   ▄   █  █ █  █       █  █▄█  █
█  █▄█  █  █ █  █  █▄█  █     ▄▄█       █
█       █  █▄█  █       █    █  █   ▄   █
▀     ▄▄█       █       █    █▄▄█  █ █  █
 ▀▄▄▄▀  ▀▄▄▄▄▄▄▄▀▄▄▄▄▄▄▄▀▄▄▄▄▄▄▄▀▄▄▀ ▀▄▄▀
  `),
  );
  console.log(c.dim("        The future of visual web automation\n"));

  p.intro(c.bgWhite(c.black(" Welcome to Vouch ")));

  // Make sure config exists automatically
  if (!fs.existsSync("vouch.config.json")) {
    await initProject(true);
  }

  const testFiles = findVchFiles(process.cwd());
  const relativeFiles = testFiles.map((f) => path.relative(process.cwd(), f));

  const action = await p.select({
    message: "What would you like to do?",
    options: [
      {
        label: "▶ Run specific tests",
        value: "run_selected",
        hint: "Choose files to run",
      },
      {
        label: "▶ Run all tests",
        value: "run_all",
        hint: "Execute all .vch files",
      },
      {
        label: "🚀 Initialize examples",
        value: "init",
        hint: "Create example tests",
      },
      { label: "❌ Exit", value: "exit" },
    ],
  });

  if (action === "exit" || p.isCancel(action)) {
    p.outro("Goodbye!");
    process.exit(0);
  }

  if (action === "init") {
    await initProject(false);
    p.outro("Examples initialized! Run 'vouch' again to execute tests.");
    process.exit(0);
  }

  let selectedFiles: string[] = [];

  if (action === "run_all") {
    if (relativeFiles.length === 0) {
      p.log.warn("No .vch files found in the current directory.");
      process.exit(0);
    }
    selectedFiles = relativeFiles;
  } else if (action === "run_selected") {
    if (relativeFiles.length === 0) {
      p.log.warn("No .vch files found in the current directory.");
      process.exit(0);
    }

    // Type to search / filter is built-in to @clack/prompts multiselect
    const files = await p.multiselect({
      message: "Select test files (type to search)",
      options: relativeFiles.map((f) => ({
        label: path.basename(f), // Just show file name
        value: f,
        hint: path.dirname(f) === "." ? undefined : path.dirname(f),
      })),
      required: true,
    });

    if (p.isCancel(files)) process.exit(0);
    selectedFiles = files as string[];
  }

  const config = loadConfig();

  p.outro("Starting tests...");

  await loadLoggerDeps();
  const logger = createLogger(config);
  let totalFailed = 0;
  for (const file of selectedFiles) {
    const result = await runTestFile(file, config, logger);
    totalFailed += result.totalFailed;
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}
