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
 * Creates the appropriate AI provider client based on config parameters.
 * Validates dependencies strictly at initialization.
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
 * Decoupled from stateful configuration layers to support dynamic model execution transformations.
 */
export class VisionQAEngine {
  private provider: AIProviderClient;
  private config: VouchConfig;

  constructor(config: VouchConfig) {
    this.config = config;
    this.provider = createProvider(config);
  }

  /**
   * Hot-swaps the underlying model provider client at runtime if config overrides are applied.
   */
  public updateConfiguration(newConfig: VouchConfig): void {
    this.config = newConfig;
    this.provider = createProvider(newConfig);
  }

  /**
   * Analyzes page context via high-performance system configurations.
   * Time Complexity: O(M) where M is the message layout serialization length.
   */
  async analyze(
    stepInstruction: string,
    imageBuffer: Buffer,
    historyLedger: HistoryEntry[],
    isAssertionLike?: boolean,
  ): Promise<VisionQAResponse> {
    if (!stepInstruction?.trim()) {
      throw new Error(
        "Execution Context Failure: Step instructions cannot be evaluated with empty string contents.",
      );
    }

    return this.provider.analyze(
      VISION_QA_SYSTEM_PROMPT,
      stepInstruction,
      imageBuffer,
      historyLedger,
      isAssertionLike,
    );
  }

  /**
   * Maps normalized coordinates (0-1000) down to absolute display spaces safely.
   * Enforces rigorous execution constraints against malformed engine coordinate sets.
   */
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

  /**
   * Evaluates if an execution outcome requires terminating the processing sequence.
   */
  public isTerminal(response: VisionQAResponse): boolean {
    if (!response || !response.actions || response.actions.length === 0) return false;
    return response.actions.some(a => (TERMINAL_ACTIONS as readonly string[]).includes(a.action));
  }

  /**
   * Determines if structural field input failures have been raised.
   */
  public hasValidationError(response: VisionQAResponse): boolean {
    // Explicit array checks safely guard against structural model parsing bugs
    return response.detectedValidationError.length > 0;
  }
}
