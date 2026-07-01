import type {
  AIProvider,
  AIProviderClient,
  HistoryEntry,
  VisionQAResponse,
  VouchConfig,
} from "../types/index";
import { TERMINAL_ACTIONS } from "../types/index";
import { VISION_QA_SYSTEM_PROMPT, ASSERTION_SYSTEM_PROMPT } from "./prompts.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { GoogleProvider } from "./providers/google.js";
import { OllamaProvider } from "./providers/ollama.js";

/**
 * Creates the appropriate AI provider client based on config parameters.
 */
export function createProvider(config: VouchConfig): AIProviderClient {
  const providers: Record<AIProvider, () => AIProviderClient> = {
    openai: () => {
      if (!config.apiKey?.trim()) {
        throw new Error(
          "Missing Dependency Exception: OpenAI API key required. Provide via VOUCH_API_KEY environment variable or configuration file.",
        );
      }
      return new OpenAIProvider(config.apiKey, config.model, config.baseUrl);
    },
    anthropic: () => {
      if (!config.apiKey?.trim()) {
        throw new Error(
          "Missing Dependency Exception: Anthropic API key required. Provide via VOUCH_API_KEY environment variable or configuration file.",
        );
      }
      return new AnthropicProvider(config.apiKey, config.model, config.baseUrl);
    },
    google: () => {
      if (!config.apiKey?.trim()) {
        throw new Error(
          "Missing Dependency Exception: Google Gemini API key required. Provide via VOUCH_API_KEY environment variable or configuration file.",
        );
      }
      return new GoogleProvider(config.apiKey, config.model);
    },
    ollama: () => {
      return new OllamaProvider(
        config.model,
        config.baseUrl?.trim() || "http://localhost:11434",
      );
    },
  };

  const factory = providers[config.provider];
  if (!factory) {
    throw new Error(
      `Unsupported Engine Target: Specified client provider "${config.provider}" does not match active implementation suites.`,
    );
  }
  return factory();
}

/**
 * VisionQA Engine — Cognitive Core Controller.
 * Selects the appropriate system prompt per step type to minimize token usage.
 */
export class VisionQAEngine {
  private provider: AIProviderClient;
  private config: VouchConfig;

  constructor(config: VouchConfig) {
    this.config = config;
    this.provider = createProvider(config);
  }

  public updateConfiguration(newConfig: VouchConfig): void {
    this.config = newConfig;
    this.provider = createProvider(newConfig);
  }

  async analyze(
    stepInstruction: string,
    imageBuffer: Buffer,
    historyLedger: HistoryEntry[],
    isAssertionLike?: boolean,
    mimeType?: "image/jpeg" | "image/png",
  ): Promise<VisionQAResponse> {
    if (!stepInstruction?.trim()) {
      throw new Error(
        "Execution Context Failure: Step instructions cannot be evaluated with empty string contents.",
      );
    }

    const systemPrompt = isAssertionLike
      ? ASSERTION_SYSTEM_PROMPT
      : VISION_QA_SYSTEM_PROMPT;

    return this.provider.analyze(
      systemPrompt,
      stepInstruction,
      imageBuffer,
      historyLedger,
      isAssertionLike,
      mimeType,
    );
  }

  public toPixelCoords(
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

  public isTerminal(response: VisionQAResponse): boolean {
    if (!response?.actions?.length) return false;
    return response.actions.some(a => (TERMINAL_ACTIONS as readonly string[]).includes(a.action));
  }

  public hasValidationError(response: VisionQAResponse): boolean {
    return response.detectedValidationError.length > 0;
  }
}
