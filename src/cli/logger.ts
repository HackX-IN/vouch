import type {
  StepResult,
  TestRunResult,
  TestStep,
  TestSuite,
} from "../types/index.js";
import type { Logger } from "./runner.js";
import type { VouchConfig } from "../types/index.js";

let chalk: any;
let figures: any;
let ora: any;

export async function loadLoggerDeps() {
  chalk = await import("chalk");
  figures = await import("figures");
  ora = await import("ora");
}

export function createLogger(config?: VouchConfig): Logger {
  const c: any = chalk?.default ?? chalk;
  const f: any = figures?.default ?? figures;
  const o: any = ora?.default ?? ora;

  let currentSpinner: any = null;
  const verbose = config?.verbose ?? false;

  const maskSecret = (str: string) => {
    if (!str) return str;
    if (config?.apiKey && config.apiKey.trim().length > 0) {
      return str.split(config.apiKey).join("***MASKED***");
    }
    return str;
  };

  return {
    info(msg: string) {
      msg = maskSecret(msg);
      if (currentSpinner) {
        currentSpinner.info(c.dim(msg));
        currentSpinner.start();
        return;
      }
      if (c && f) console.log(c.dim(`  ${f.pointerSmall} ${msg}`));
      else console.log(`  > ${msg}`);
    },
    error(msg: string) {
      msg = maskSecret(msg);
      if (currentSpinner) {
        currentSpinner.fail(c.red(msg));
        currentSpinner = null;
        return;
      }
      if (c && f) console.log(c.red(`  ${f.cross} ${msg} `));
      else console.error(`  X ${msg}`);
    },
    suiteStart(suite: TestSuite) {
      console.log();
      if (c) {
        console.log(c.bold.green(`  🕸️ ${suite.name}`));
        console.log(c.dim(`  ${suite.filePath}`));
        console.log(
          c.dim(
            `  ${suite.steps.filter((s: any) => s.type !== "comment").length} steps`,
          ),
        );
      } else {
        console.log(`  🕸️ ${suite.name}\n  ${suite.filePath}`);
      }
      console.log();
    },
    suiteEnd(result: TestRunResult) {
      const duration = ((result.endTime - result.startTime) / 1000).toFixed(2);
      console.log();
      if (c && f) {
        console.log(c.dim("  ─────────────────────────────────────"));
        if (result.totalFailed === 0) {
          console.log(
            c.bold.green(`  ${f.tick} All ${result.totalPassed} steps passed`) +
              c.dim(` (${duration}s)`),
          );
        } else {
          console.log(
            c.bold.red(`  ${f.cross} ${result.totalFailed} failed`) +
              c.dim(` | `) +
              c.green(`${result.totalPassed} passed`) +
              c.dim(` (${duration}s)`),
          );
        }

        // Show aggregate timing breakdown
        if (result.timing) {
          const inferSec = (result.timing.totalInferenceMs / 1000).toFixed(1);
          const execSec = (result.timing.totalExecutionMs / 1000).toFixed(1);
          const inferPct = result.timing.totalInferenceMs + result.timing.totalExecutionMs > 0
            ? Math.round((result.timing.totalInferenceMs / (result.timing.totalInferenceMs + result.timing.totalExecutionMs)) * 100)
            : 0;
          console.log(
            c.dim(`  ⏱  AI inference: ${inferSec}s (${inferPct}%) | Browser execution: ${execSec}s (${100 - inferPct}%)`),
          );
        }
      } else {
        console.log(
          `  ${result.totalFailed === 0 ? "Passed" : "Failed"}: ${result.totalPassed} passed, ${result.totalFailed} failed (${duration}s)`,
        );
      }
      console.log();
    },
    stepStart(step: TestStep) {
      if (step.type === "comment") return;
      if (c && o) {
        const prefix =
          step.type === "navigate"
            ? "🌐"
            : step.type === "assert"
              ? "🔍"
              : step.type === "wait"
                ? "⏳"
                : "🎯";
        currentSpinner = o({
          text:
            c.dim(`${prefix} L${step.lineNumber}: `) +
            c.green(step.instruction),
          color: "green",
          spinner: "dots",
        }).start();
      } else {
        process.stdout.write(`  L${step.lineNumber}: ${step.instruction}  `);
      }
    },
    stepEnd(result: StepResult) {
      if (result.step.type === "comment") return;
      const durationStr = `${(result.duration / 1000).toFixed(1)}s`;

      if (currentSpinner) {
        if (result.status === "passed") {
          let suffix = c.dim(` ${durationStr}`);
          // Show timing breakdown in verbose mode
          if (verbose && result.timing) {
            const inferMs = result.timing.totalInferenceMs;
            const execMs = result.timing.totalExecutionMs;
            suffix += c.dim(` [inference: ${inferMs}ms | exec: ${execMs}ms]`);
          }
          currentSpinner.succeed(currentSpinner.text + suffix);
        } else if (result.status === "failed") {
          currentSpinner.fail(currentSpinner.text + c.dim(` ${durationStr}`));
          if (result.error) {
            console.log(c.dim(`     └─ `) + c.red(maskSecret(result.error)));
          }
          // Show failure screenshot path
          if (result.failureScreenshot) {
            console.log(c.dim(`     📸 Screenshot: `) + c.yellow(result.failureScreenshot));
          }
          // Show verbose debugging info
          if (verbose && result.attempts.length > 0) {
            for (const attempt of result.attempts) {
              const coordsInfo = `(${attempt.x}, ${attempt.y})`;
              const inferInfo = attempt.inferenceTimeMs ? ` [${attempt.inferenceTimeMs}ms]` : "";
              const statusIcon = attempt.success ? c.green("✓") : c.red("✗");
              console.log(
                c.dim(`     │  ${statusIcon} Attempt #${attempt.attempt}: `) +
                c.dim(`${attempt.action} @ ${coordsInfo}${inferInfo}`) +
                (attempt.textPayload ? c.dim(` text="${attempt.textPayload}"`) : "")
              );
              if (attempt.error) {
                console.log(c.dim(`     │    reason: `) + c.red(maskSecret(attempt.error).split("\n")[0]));
              }
            }
          }
        } else {
          currentSpinner.stopAndPersist({
            symbol: c.dim(f.arrowRight),
            text: currentSpinner.text + c.dim(" skipped"),
          });
        }
        currentSpinner = null;
      } else {
        if (result.status === "passed") {
          if (c && f) console.log(c.green(f.tick) + c.dim(` ${durationStr}`));
          else console.log(` OK ${durationStr}`);
        } else if (result.status === "failed") {
          if (c && f) {
            console.log(c.red(f.cross) + c.dim(` ${durationStr}`));
            if (result.error)
              console.log(c.dim(`     └─ `) + c.red(maskSecret(result.error)));
            if (result.failureScreenshot)
              console.log(c.dim(`     📸 Screenshot: `) + c.yellow(result.failureScreenshot));
          } else {
            console.log(` FAIL ${durationStr}`);
            if (result.error)
              console.log(`     └─ ${maskSecret(result.error)}`);
            if (result.failureScreenshot)
              console.log(`     📸 Screenshot: ${result.failureScreenshot}`);
          }
        } else {
          if (c && f) console.log(c.dim(f.arrowRight + " skipped"));
          else console.log(" skipped");
        }
      }
    },
  };
}
