import { GoogleGenerativeAI } from "@google/generative-ai";
import type { HistoryEntry, VisionQAResponse } from "../../types/index.js";
import { buildUserMessage } from "../prompts.js";
import { BaseProvider } from "./base.js";

/**
 * Google Gemini provider with streaming + early JSON cutoff.
 * Breaks the stream loop the moment a complete JSON response is detected.
 */
export class GoogleProvider extends BaseProvider {
  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model: string = "gemini-2.0-flash") {
    super();
    this.genAI = new GoogleGenerativeAI(apiKey);
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
    const generativeModel = this.genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    });

    const result = await generativeModel.generateContentStream([
      { text: userMessage },
    ]);

    let accumulated = "";
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        accumulated += text;

        // Early cutoff — stop as soon as we have complete JSON
        if (this.hasCompleteJSON(accumulated)) {
          break;
        }
      }
    }

    if (!accumulated.trim())
      throw new Error("Google Gemini returned empty response");
    return this.parseResponse(accumulated);
  }
}
