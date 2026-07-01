import OpenAI from "openai";
import type { HistoryEntry, VisionQAResponse } from "../../types/index.js";
import { buildUserMessage } from "../prompts.js";
import { BaseProvider } from "./base.js";

/**
 * OpenAI provider with streaming + early JSON cutoff.
 * Aborts the stream the moment a complete JSON response is detected.
 * Uses temperature decay on retries for improved determinism.
 */
export class OpenAIProvider extends BaseProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = "gpt-4o", baseUrl?: string) {
    super();
    this.client = new OpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
    this.model = model;
  }

  async analyze(
    systemPrompt: string,
    stepInstruction: string,
    imageBuffer: Buffer,
    historyLedger: HistoryEntry[],
    isAssertionLike?: boolean,
    mimeType: "image/jpeg" | "image/png" = "image/jpeg",
  ): Promise<VisionQAResponse> {
    return this.withTiming(async () => {
      const userMessage = buildUserMessage(stepInstruction, historyLedger);
      const base64Image = imageBuffer.toString("base64");

      // Temperature decay: lower temperature on retries for more deterministic outputs
      const retryCount = historyLedger.filter(h => !h.success).length;
      const temperature = Math.max(0, 0.1 - (retryCount * 0.03));

      const stream = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 1024,
        temperature,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userMessage },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                  detail: "high"
                },
              },
            ],
          },
        ],
      });

      let accumulated = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        accumulated += delta;

        // Early cutoff — stop as soon as we have complete JSON
        if (this.hasCompleteJSON(accumulated)) {
          stream.controller.abort();
          break;
        }
      }

      if (!accumulated.trim()) throw new Error("OpenAI returned empty response");
      return this.parseResponse(accumulated);
    });
  }
}
