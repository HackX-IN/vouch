import OpenAI from "openai";
import type { HistoryEntry, VisionQAResponse } from "../../types/index.js";
import { buildUserMessage } from "../prompts.js";
import { BaseProvider } from "./base.js";

/**
 * OpenAI provider with streaming + early JSON cutoff.
 * Aborts the stream the moment a complete JSON response is detected.
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
    screenReaderOutput: string,
    historyLedger: HistoryEntry[],
  ): Promise<VisionQAResponse> {
    const userMessage = buildUserMessage(
      stepInstruction,
      historyLedger,
      screenReaderOutput,
    );

    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 1024,
      temperature: 0.1,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
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
  }
}
