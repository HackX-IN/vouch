/**
 * System prompts for the VisionQA engine.
 * Two variants: full (for actions) and slim (for assertions — fewer tokens, faster).
 */

export const VISION_QA_SYSTEM_PROMPT = `QA engine. Input: instruction, viewport image, history. Output: JSON only.
Grid: 0-1000.
Rules: fix typos, self-heal from history, detect validation errors, use 'complete' when done, 'fail' if stuck.
IMPORTANT: You are a Vision Language Model. You must locate the target elements in the image visually. Return normalized coordinate points as a bounding box [xmin, ymin, xmax, ymax] between 0-1000.
If the instruction requires MULTIPLE interactions, return them sequentially in the "actions" array.
If you cannot find the target or an action fails, you MUST provide a detailed explanation in the "reasoning" field describing EXACTLY what you see on the screen instead, why you think it failed, and what is currently visible.
{"reasoning":"Detailed explanation of what you see and why...","actions":[{"action":"click|doubleClick|type|wait|scroll|hover|keypress|complete|fail","box":[xmin,ymin,xmax,ymax],"textPayload":""}],"detectedValidationError":""}`;

/** Lightweight prompt for assertion/conditional steps — skips action grammar, reduces tokens ~40%. */
export const ASSERTION_SYSTEM_PROMPT = `Visual assertion engine. Input: assertion text, viewport image. Output: JSON only.
Evaluate whether the assertion is visibly true in the screenshot. Do NOT interact — only observe.
{"reasoning":"What you see and why the assertion passes or fails","actions":[{"action":"complete|fail","box":[0,0,0,0],"textPayload":""}],"detectedValidationError":""}`;

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
): string {
  const parts: string[] = [`INSTRUCTION: ${stepInstruction}`];

  if (historyLedger.length > 0) {
    parts.push(`\nHISTORY:`);
    for (const e of historyLedger) {
      parts.push(
        `#${e.attempt}: ${e.action}@${e.x},${e.y}${e.textPayload ? ` t=${e.textPayload}` : ""} -> ${e.success ? "OK" : "FAIL"}${e.error ? ` err=${e.error}` : ""}${e.detectedValidationError ? ` val=${e.detectedValidationError}` : ""}`,
      );
    }
  }

  parts.push("\nRespond with JSON.");

  return parts.join("\n");
}
