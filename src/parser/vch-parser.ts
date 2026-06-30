import * as fs from "node:fs";
import * as path from "node:path";
import type { TestStep, TestSuite } from "../types/index";

/**
 * Parses `.vch` script sheets into structured TestSuite object configurations.
 * Handles structural schema errors defensively, reporting accurate line numbers on failures.
 *
 * Time Complexity: O(N) where N is the character length of the raw file content.
 * Space Complexity: O(M) where M is the generated instruction step matrix ledger allocation.
 */
export function parseVchFile(filePath: string): TestSuite {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `File System Exception: Targeted test script sheet path not found: "${absolutePath}"`,
    );
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  const lines = content.split(/\r?\n/); // Safely handle both POSIX and Windows line endings

  let suiteName = path.basename(filePath, ".vch");
  const steps: TestStep[] = [];

  // Scoping depth indicator to guarantee structural integrity of conditional flows
  let activeConditionalDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const lineNumber = i + 1;

    if (!trimmed) continue;

    // 1. Comment Processing Path
    if (trimmed.startsWith("#")) {
      steps.push({
        lineNumber,
        raw,
        instruction: trimmed.slice(1).trim(),
        type: "comment",
      });
      continue;
    }

    // 2. Metadata Key-Value Processing Path
    if (trimmed.startsWith(">")) {
      const metaContent = trimmed.slice(1).trim();
      const colonIndex = metaContent.indexOf(":");

      if (colonIndex <= 0) {
        throw new Error(
          `Syntax Error [Line ${lineNumber}]: Malformed metadata assignments. Expected "> key: value", found "${trimmed}"`,
        );
      }

      const key = metaContent.slice(0, colonIndex).trim().toLowerCase();
      // Safely slice all remaining content to preserve parameters with standalone ports/colons
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

    // 3. Navigation Directives
    if (trimmed.startsWith("@navigate")) {
      const url = trimmed.slice(9).trim(); // Fast offset pointer slice instead of sweeping RegExp lookups
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

    // 4. Thread Delay Wait Directives
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

    // 5. Visual State Assertion Directives
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

    // 6. Branching Condition Blocks
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

    // 7. Scoping End Tokens
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
        type: "conditional_end", // Structural marker — never sent to AI
      });
      continue;
    }

    // Prevent random unhandled structural directive tokens leaks from hitting natural language layers
    if (trimmed.startsWith("@")) {
      throw new Error(
        `Syntax Error [Line ${lineNumber}]: Unrecognized runner directive statement framework instruction: "${trimmed}"`,
      );
    }

    // 8. Plain English Actions Execution Path Fallback
    steps.push({
      lineNumber,
      raw,
      instruction: trimmed,
      type: "action",
    });
  }

  // Verify that all conditional blocks opened were closed correctly
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
