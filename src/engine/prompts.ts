/**
 * VisionQA-Engine System Prompt
 * Token-optimized for faster response and lower cost.
 */

export const VISION_QA_SYSTEM_PROMPT = `QA engine. Input: instruction, UI tree, history. Output: JSON only.
Grid: 0-1000. Format: role "name" v="val" @x,y
Rules: fix typos, self-heal from history, detect validation errors, use 'complete' when done, 'fail' if stuck.
{"reasoning":"...","action":"click|type|wait|scroll|hover|keypress|select|upload|complete|fail","x":0,"y":0,"textPayload":"","detectedValidationError":""}`;



export function buildUserMessage(
  stepInstruction: string,
  historyLedger: Array<{
    attempt: number;
    action: string;
    x: number;
    y: number;
    textPayload?: string;
    success: boolean;
    error?: string;
    detectedValidationError?: string;
  }>,
  screenReaderOutput: string
): string {
  const parts: string[] = [];

  parts.push(`INSTRUCTION: ${stepInstruction}`);

  if (screenReaderOutput) {
    parts.push(`\n${screenReaderOutput}`);
  }

  if (historyLedger.length > 0) {
    parts.push(`\nHISTORY:`);
    for (const e of historyLedger) {
      parts.push(
        `#${e.attempt}: ${e.action}@${e.x},${e.y}${e.textPayload ? ` t=${e.textPayload}` : ""} -> ${e.success ? "OK" : "FAIL"}${e.error ? ` err=${e.error}` : ""}${e.detectedValidationError ? ` val=${e.detectedValidationError}` : ""}`
      );
    }
  }

  parts.push("\nRespond with JSON.");

  return parts.join("\n");
}
