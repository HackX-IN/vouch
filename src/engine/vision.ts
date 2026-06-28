import type {
  AIProvider,
  AIProviderClient,
  HistoryEntry,
  VisionQAResponse,
  VouchConfig,
} from "../types/index";
import { TERMINAL_ACTIONS } from "../types/index";
import { VISION_QA_SYSTEM_PROMPT } from "./prompts.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { GoogleProvider } from "./providers/google.js";
import { OllamaProvider } from "./providers/ollama.js";

/**
 * Creates the appropriate AI provider client based on config.
 */
export function createProvider(config: VouchConfig): AIProviderClient {
  const providers: Record<AIProvider, () => AIProviderClient> = {
    openai: () => {
      if (!config.apiKey)
        throw new Error(
          "OpenAI API key is required. Set VOUCH_API_KEY or provider.apiKey in config.",
        );
      return new OpenAIProvider(config.apiKey, config.model, config.baseUrl);
    },
    anthropic: () => {
      if (!config.apiKey)
        throw new Error(
          "Anthropic API key is required. Set VOUCH_API_KEY or provider.apiKey in config.",
        );
      return new AnthropicProvider(config.apiKey, config.model, config.baseUrl);
    },
    google: () => {
      if (!config.apiKey)
        throw new Error(
          "Google API key is required. Set VOUCH_API_KEY or provider.apiKey in config.",
        );
      return new GoogleProvider(config.apiKey, config.model);
    },
    ollama: () => {
      return new OllamaProvider(
        config.model,
        config.baseUrl || "http://localhost:11434",
      );
    },
  };

  const factory = providers[config.provider];
  if (!factory) {
    throw new Error(
      `Unknown AI provider: "${config.provider}". Supported: openai, anthropic, google, ollama`,
    );
  }
  return factory();
}

/**
 * VisionQA Engine — the cognitive core of Vouch.
 *
 * Uses screen reader output (not screenshots) for AI analysis.
 */
export class VisionQAEngine {
  private provider: AIProviderClient;
  private config: VouchConfig;

  constructor(config: VouchConfig) {
    this.config = config;
    this.provider = createProvider(config);
  }

  /**
   * Analyze the page using screen reader output and step instruction.
   */
  async analyze(
    stepInstruction: string,
    screenReaderOutput: string,
    historyLedger: HistoryEntry[],
  ): Promise<VisionQAResponse> {
    return this.provider.analyze(
      VISION_QA_SYSTEM_PROMPT,
      stepInstruction,
      screenReaderOutput,
      historyLedger,
    );
  }

  /**
   * Convert normalized coordinates (0-1000) to pixel coordinates.
   */
  toPixelCoords(
    normalizedX: number,
    normalizedY: number,
    viewportWidth: number,
    viewportHeight: number,
  ): { pixelX: number; pixelY: number } {
    return {
      pixelX: Math.round((normalizedX / 1000) * viewportWidth),
      pixelY: Math.round((normalizedY / 1000) * viewportHeight),
    };
  }

  /**
   * Checks if the response indicates a terminal action.
   */
  isTerminal(response: VisionQAResponse): boolean {
    return (TERMINAL_ACTIONS as readonly string[]).includes(response.action);
  }

  /**
   * Checks if the response contains a validation error.
   */
  hasValidationError(response: VisionQAResponse): boolean {
    return response.detectedValidationError.length > 0;
  }
}
