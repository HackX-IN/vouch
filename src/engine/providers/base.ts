import type {
  AIProviderClient,
  HistoryEntry,
  VisionQAResponse,
} from "../../types/index";

/**
 * Base helper for all AI providers.
 * Handles response parsing, validation, and streaming JSON detection.
 */
export abstract class BaseProvider implements AIProviderClient {
  abstract analyze(
    systemPrompt: string,
    stepInstruction: string,
    screenReaderOutput: string,
    historyLedger: HistoryEntry[],
  ): Promise<VisionQAResponse>;

  /**
   * Parses the raw AI response text into a validated VisionQAResponse.
   */
  protected parseResponse(raw: string): VisionQAResponse {
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```(?:json)?\s*\n?/, "")
        .replace(/\n?```\s*$/, "");
    }
    cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        const extracted = match[0].replace(/,\s*([\]}])/g, "$1");
        parsed = JSON.parse(extracted);
      } else {
        throw new Error(
          `Failed to parse AI response as JSON:\n${raw.slice(0, 500)}`,
        );
      }
    }

    return {
      reasoning: String(parsed.reasoning ?? ""),
      action: String(parsed.action ?? "fail"),
      x: Math.round(Number(parsed.x ?? 500)),
      y: Math.round(Number(parsed.y ?? 500)),
      textPayload: String(parsed.textPayload ?? ""),
      detectedValidationError: String(parsed.detectedValidationError ?? ""),
    };
  }

  /**
   * Checks if accumulated text contains a complete JSON object.
   * Returns true when we can safely stop streaming.
   * Uses brace-depth tracking with proper string/escape handling.
   */
  protected hasCompleteJSON(text: string): boolean {
    let depth = 0;
    let inString = false;
    let escape = false;
    let started = false;

    for (const ch of text) {
      if (escape) { escape = false; continue; }
      if (ch === "\\" && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") { depth++; started = true; }
      else if (ch === "}") {
        depth--;
        if (started && depth === 0) return true;
      }
    }
    return false;
  }
}

