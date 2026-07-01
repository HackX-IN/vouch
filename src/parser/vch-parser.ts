import * as fs from "node:fs";
import * as path from "node:path";
import type { TestStep, TestSuite } from "../types/index";

/**
 * Parses `.vch` script sheets into structured TestSuite object configurations.
 * Handles structural schema errors defensively, reporting accurate line numbers on failures.
 */
export function parseVchFile(filePath: string): TestSuite {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `File System Exception: Targeted test script sheet path not found: "${absolutePath}"`,
    );
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  const lines = content.split(/\r?\n/);

  let suiteName = path.basename(filePath, ".vch");
  const steps: TestStep[] = [];

  let activeConditionalDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const lineNumber = i + 1;

    if (!trimmed) continue;

    // 1. Comment
    if (trimmed.startsWith("#")) {
      steps.push({
        lineNumber,
        raw,
        instruction: trimmed.slice(1).trim(),
        type: "comment",
      });
      continue;
    }

    // 2. Metadata
    if (trimmed.startsWith(">")) {
      const metaContent = trimmed.slice(1).trim();
      const colonIndex = metaContent.indexOf(":");

      if (colonIndex <= 0) {
        throw new Error(
          `Syntax Error [Line ${lineNumber}]: Malformed metadata assignments. Expected "> key: value", found "${trimmed}"`,
        );
      }

      const key = metaContent.slice(0, colonIndex).trim().toLowerCase();
      const value = metaContent.slice(colonIndex + 1).trim();

      if (!value) {
        throw new Error(
          `Syntax Error [Line ${lineNumber}]: Metadata block key "${key}" contains an empty parameter allocation.`,
        );
      }

      if (key === "name") {
        suiteName = value;
      }
      continue;
    }

    // 3. Navigation
    if (trimmed.startsWith("@navigate")) {
      const url = trimmed.slice(9).trim();
      if (!url || url === "@navigate") {
        throw new Error(
          `Syntax Error [Line ${lineNumber}]: Directives for "@navigate" require a valid target URL value parameter assignment.`,
        );
      }
      steps.push({
        lineNumber,
        raw,
        instruction: url,
        type: "navigate",
        meta: { url },
      });
      continue;
    }

    // 4. Wait
    if (trimmed.startsWith("@wait")) {
      const msParam = trimmed.slice(5).trim();
      const ms = parseInt(msParam, 10);

      if (isNaN(ms) || ms < 0) {
        throw new Error(
          `Syntax Error [Line ${lineNumber}]: Directives for "@wait" must define a non-negative numerical millisecond value. Found: "${msParam}"`,
        );
      }

      steps.push({
        lineNumber,
        raw,
        instruction: `Wait for ${ms}ms`,
        type: "wait",
        meta: { duration: String(ms) },
      });
      continue;
    }

    // 5. Assert
    if (trimmed.startsWith("@assert")) {
      const assertion = trimmed.slice(7).trim();
      if (!assertion) {
        throw new Error(
          `Syntax Error [Line ${lineNumber}]: Directives for "@assert" require explicit plain English conditional validation instructions.`,
        );
      }
      steps.push({
        lineNumber,
        raw,
        instruction: assertion,
        type: "assert",
      });
      continue;
    }

    // 6. Screenshot — saves a named PNG snapshot of the current viewport
    if (trimmed.startsWith("@screenshot")) {
      const name = trimmed.slice(11).trim();
      if (!name) {
        throw new Error(
          `Syntax Error [Line ${lineNumber}]: Directives for "@screenshot" require a file name argument (e.g., @screenshot login-page).`,
        );
      }
      // Strip any .png the user added, we always append it
      const safeName = name.replace(/\.png$/i, "").replace(/[^a-zA-Z0-9._-]/g, "_");
      steps.push({
        lineNumber,
        raw,
        instruction: `Screenshot: ${safeName}`,
        type: "screenshot",
        meta: { name: safeName },
      });
      continue;
    }

    // 7. Conditional block
    if (trimmed.startsWith("@if")) {
      const condition = trimmed.slice(3).trim();
      if (!condition) {
        throw new Error(
          `Syntax Error [Line ${lineNumber}]: Directives for "@if" require a valid layout condition statement parameter.`,
        );
      }

      activeConditionalDepth++;
      steps.push({
        lineNumber,
        raw,
        instruction: condition,
        type: "conditional",
      });
      continue;
    }

    // 8. End conditional
    if (trimmed.startsWith("@endif")) {
      if (activeConditionalDepth <= 0) {
        throw new Error(
          `Compilation Closure Fault [Line ${lineNumber}]: Encountered an isolated "@endif" statement token without a matching parent "@if" condition block.`,
        );
      }
      activeConditionalDepth--;
      steps.push({
        lineNumber,
        raw,
        instruction: "End of conditional block execution scope",
        type: "conditional_end",
      });
      continue;
    }

    // Block unknown directives
    if (trimmed.startsWith("@")) {
      throw new Error(
        `Syntax Error [Line ${lineNumber}]: Unrecognized runner directive statement framework instruction: "${trimmed}"`,
      );
    }

    // 9. Plain English action fallback
    steps.push({
      lineNumber,
      raw,
      instruction: trimmed,
      type: "action",
    });
  }

  if (activeConditionalDepth > 0) {
    throw new Error(
      `Compilation Structural Fault [File: ${suiteName}]: Script processing terminated with unclosed structural scopes. Missing trailing "@endif" closures across ${activeConditionalDepth} conditional logic pathways.`,
    );
  }

  return {
    name: suiteName,
    filePath: absolutePath,
    steps,
  };
}
