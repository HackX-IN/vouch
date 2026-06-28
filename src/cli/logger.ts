import type {
  StepResult,
  TestRunResult,
  TestStep,
  TestSuite,
} from "../types/index.js";
import type { Logger } from "./runner.js";

let chalk: any;
let figures: any;
let ora: any;

export async function loadLoggerDeps() {
  chalk = await import("chalk");
  figures = await import("figures");
  ora = await import("ora");
}

export function createLogger(): Logger {
  const c: any = chalk?.default ?? chalk;
  const f: any = figures?.default ?? figures;
  const o: any = ora?.default ?? ora;

  let currentSpinner: any = null;

  return {
    info(msg: string) {
      if (currentSpinner) {
        currentSpinner.info(c.dim(msg));
        currentSpinner.start();
        return;
      }
      if (c && f) console.log(c.dim(`  ${f.pointerSmall} ${msg}`));
      else console.log(`  > ${msg}`);
    },
    error(msg: string) {
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
            c.bold.green(`  ${f.cross} ${result.totalFailed} failed`) +
              c.dim(` | `) +
              c.green(`${result.totalPassed} passed`) +
              c.dim(` (${duration}s)`),
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
          currentSpinner.succeed(
            currentSpinner.text + c.dim(` ${durationStr}`),
          );
        } else if (result.status === "failed") {
          currentSpinner.fail(currentSpinner.text + c.dim(` ${durationStr}`));
          if (result.error)
            console.log(c.dim(`     └─ `) + c.red(result.error.slice(0, 120)));
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
              console.log(c.green(`     └─ ${result.error.slice(0, 120)}`));
          } else {
            console.log(` FAIL ${durationStr}`);
            if (result.error)
              console.log(`     └─ ${result.error.slice(0, 120)}`);
          }
        } else {
          if (c && f) console.log(c.dim(f.arrowRight + " skipped"));
          else console.log(" skipped");
        }
      }
    },
  };
}
