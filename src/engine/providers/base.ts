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
    imageBuffer: Buffer,
    historyLedger: HistoryEntry[],
  ): Promise<VisionQAResponse>;

  /**
   * Wraps an analyze call with inference timing measurement.
   * Subclasses call this to get automatic timing on their responses.
   */
  protected async withTiming(
    fn: () => Promise<VisionQAResponse>,
  ): Promise<VisionQAResponse> {
    const start = performance.now();
    const response = await fn();
    response.inferenceTimeMs = Math.round(performance.now() - start);
    return response;
  }

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

    let actions: any[] = [];
    if (Array.isArray(parsed.actions)) {
      actions = parsed.actions.map(a => {
        let x = 500, y = 500;
        if (Array.isArray(a.box) && a.box.length === 4) {
          const [xmin, ymin, xmax, ymax] = a.box;
          x = Math.round((Number(xmin) + Number(xmax)) / 2);
          y = Math.round((Number(ymin) + Number(ymax)) / 2);
        } else {
          x = Math.round(Number(a.x ?? 500));
          y = Math.round(Number(a.y ?? 500));
        }
        return {
          action: String(a.action ?? "fail"),
          x,
          y,
          textPayload: String(a.textPayload ?? "")
        };
      });
    } else {
      let x = 500, y = 500;
      if (Array.isArray(parsed.box) && parsed.box.length === 4) {
        const [xmin, ymin, xmax, ymax] = parsed.box;
        x = Math.round((Number(xmin) + Number(xmax)) / 2);
        y = Math.round((Number(ymin) + Number(ymax)) / 2);
      } else {
        x = Math.round(Number(parsed.x ?? 500));
        y = Math.round(Number(parsed.y ?? 500));
      }
      actions.push({
        action: String(parsed.action ?? "fail"),
        x,
        y,
        textPayload: String(parsed.textPayload ?? "")
      });
    }

    return {
      reasoning: String(parsed.reasoning ?? ""),
      actions,
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
