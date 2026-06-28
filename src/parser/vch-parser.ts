import * as fs from "node:fs";
import * as path from "node:path";
import type { TestStep, TestSuite } from "../types/index";

/**
 * Parses `.vtest` files into structured TestSuite objects.
 *
 * .vtest Format:
 * ─────────────
 * Lines starting with # are comments
 * Lines starting with > are metadata (suite name, config overrides)
 * Lines starting with @ are directives (@navigate, @wait, @assert)
 * All other non-empty lines are plain English action instructions
 *
 * Example:
 *   > name: Login Flow Test
 *   @navigate https://example.com/login
 *   click on the email input field
 *   type test@example.com in the email field
 *   click the password field
 *   type MySecurePass123! in the password field
 *   click the Sign In button
 *   @assert Dashboard page is visible
 */
export function parseVchFile(filePath: string): TestSuite {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Test file not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  const lines = content.split("\n");

  let suiteName = path.basename(filePath, ".vch");
  const steps: TestStep[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const lineNumber = i + 1;

    // Skip empty lines
    if (!trimmed) continue;

    // Comment lines
    if (trimmed.startsWith("#")) {
      steps.push({
        lineNumber,
        raw,
        instruction: trimmed.slice(1).trim(),
        type: "comment",
      });
      continue;
    }

    // Metadata lines
    if (trimmed.startsWith(">")) {
      const metaContent = trimmed.slice(1).trim();
      const colonIndex = metaContent.indexOf(":");
      if (colonIndex > 0) {
        const key = metaContent.slice(0, colonIndex).trim().toLowerCase();
        const value = metaContent.slice(colonIndex + 1).trim();
        if (key === "name") {
          suiteName = value;
        }
      }
      continue;
    }

    // Navigate directive
    if (trimmed.startsWith("@navigate")) {
      const url = trimmed.replace(/^@navigate\s+/, "").trim();
      steps.push({
        lineNumber,
        raw,
        instruction: url,
        type: "navigate",
        meta: { url },
      });
      continue;
    }

    // Wait directive
    if (trimmed.startsWith("@wait")) {
      const ms = trimmed.replace(/^@wait\s+/, "").trim();
      steps.push({
        lineNumber,
        raw,
        instruction: `Wait for ${ms}ms`,
        type: "wait",
        meta: { duration: ms },
      });
      continue;
    }

    // Assert directive
    if (trimmed.startsWith("@assert")) {
      const assertion = trimmed.replace(/^@assert\s+/, "").trim();
      steps.push({
        lineNumber,
        raw,
        instruction: assertion,
        type: "assert",
      });
      continue;
    }

    // Conditional directive
    if (trimmed.startsWith("@if")) {
      const condition = trimmed.replace(/^@if\s+/, "").trim();
      steps.push({
        lineNumber,
        raw,
        instruction: condition,
        type: "conditional",
      });
      continue;
    }

    // Plain English action instruction
    steps.push({
      lineNumber,
      raw,
      instruction: trimmed,
      type: "action",
    });
  }

  return {
    name: suiteName,
    filePath: absolutePath,
    steps,
  };
}
