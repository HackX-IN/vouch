import Anthropic from "@anthropic-ai/sdk";
import type { HistoryEntry, VisionQAResponse } from "../../types/index";
import { buildUserMessage } from "../prompts.js";
import { BaseProvider } from "./base.js";

/**
 * Anthropic provider with streaming + early JSON cutoff.
 * Aborts the stream the moment a complete JSON response is detected.
 */
export class AnthropicProvider extends BaseProvider {
  private client: Anthropic;
  private model: string;

  constructor(
    apiKey: string,
    model: string = "claude-sonnet-4-20250514",
    baseUrl?: string,
  ) {
    super();
    this.client = new Anthropic({
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

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 1024,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    let accumulated = "";

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        accumulated += event.delta.text;

        // Early cutoff — stop as soon as we have complete JSON
        if (this.hasCompleteJSON(accumulated)) {
          stream.abort();
          break;
        }
      }
    }

    if (!accumulated.trim()) {
      throw new Error("Anthropic returned no text content");
    }
    return this.parseResponse(accumulated);
  }
}
