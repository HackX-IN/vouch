import type { HistoryEntry, VisionQAResponse } from "../../types/index.js";
import { buildUserMessage } from "../prompts.js";
import { BaseProvider } from "./base.js";

/**
 * Ollama provider for running local AI models.
 * Uses streaming with early JSON cutoff — aborts inference
 * the moment a complete JSON object is detected.
 */
export class OllamaProvider extends BaseProvider {
  private baseUrl: string;
  private model: string;

  constructor(
    model: string = "llava",
    baseUrl: string = "http://localhost:11434",
  ) {
    super();
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async analyze(
    systemPrompt: string,
    stepInstruction: string,
    screenReaderOutput: string,
    historyLedger: HistoryEntry[],
  ): Promise<VisionQAResponse> {
    const userMessage = buildUserMessage(
      stepInstruction,
      historyLedger,
      screenReaderOutput,
    );

    const controller = new AbortController();

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: this.model,
        stream: true,
        keep_alive: "5m",
        options: {
          temperature: 0.1,
          num_predict: 1024,
        },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${errText}`);
    }

    // Stream tokens and abort the instant we have valid JSON
    const raw = await this.streamUntilJSON(response, controller);
    if (!raw) throw new Error("Ollama returned empty response");
    return this.parseResponse(raw);
  }

  /**
   * Reads the streaming response token-by-token.
   * As soon as the accumulated text contains a complete JSON object
   * (balanced braces), we abort the connection and return immediately.
   * This saves significant inference time on trailing tokens.
   */
  private async streamUntilJSON(
    response: Response,
    controller: AbortController,
  ): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body from Ollama");

    const decoder = new TextDecoder();
    let accumulated = "";
    let braceDepth = 0;
    let inString = false;
    let escape = false;
    let jsonStarted = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Each line is a JSON object like: {"message":{"content":"..."}, "done":false}
        const lines = chunk.split("\n").filter((l) => l.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line) as {
              message?: { content?: string };
              done?: boolean;
            };
            const token = data.message?.content ?? "";
            accumulated += token;

            // Track brace depth for early cutoff
            for (const ch of token) {
              if (escape) {
                escape = false;
                continue;
              }
              if (ch === "\\" && inString) {
                escape = true;
                continue;
              }
              if (ch === '"') {
                inString = !inString;
                continue;
              }
              if (inString) continue;
              if (ch === "{") {
                braceDepth++;
                jsonStarted = true;
              } else if (ch === "}") {
                braceDepth--;
                // Complete JSON object detected — abort immediately
                if (jsonStarted && braceDepth === 0) {
                  controller.abort();
                  return accumulated;
                }
              }
            }

            if (data.done) {
              return accumulated;
            }
          } catch {
            // Malformed line, skip
          }
        }
      }
    } catch (err: any) {
      // AbortError is expected — we intentionally abort on complete JSON
      if (err?.name === "AbortError") {
        return accumulated;
      }
      // If we already have content, return it despite the error
      if (accumulated.trim()) return accumulated;
      throw err;
    } finally {
      reader.releaseLock();
    }

    return accumulated;
  }
}
