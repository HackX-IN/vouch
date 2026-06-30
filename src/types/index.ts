// ─── Core Action Types ───────────────────────────────────────────────

/** Action type is a free string — AI can output any action (click, type, scroll, hover, keypress, etc.) */
export type ActionType = string;

/** Terminal actions that signal the end of a step. */
export const TERMINAL_ACTIONS = ["complete", "fail"] as const;

export interface VisionQAAction {
  action: ActionType;
  x: number;
  y: number;
  textPayload?: string;
}

export interface VisionQAResponse {
  reasoning: string;
  actions: VisionQAAction[];
  detectedValidationError: string;
  /** Time spent waiting for VLM inference (ms) — populated by providers */
  inferenceTimeMs?: number;
}

// ─── History Ledger ──────────────────────────────────────────────────

export interface HistoryEntry {
  attempt: number;
  action: ActionType;
  x: number;
  y: number;
  textPayload?: string;
  timestamp: number;
  success: boolean;
  error?: string;
  detectedValidationError?: string;
  /** VLM inference latency for this attempt (ms) */
  inferenceTimeMs?: number;
  /** Path to the failure screenshot, if any */
  screenshotPath?: string;
}

// ─── Test Step ───────────────────────────────────────────────────────

export interface TestStep {
  lineNumber: number;
  raw: string;
  instruction: string;
  type: "navigate" | "action" | "assert" | "wait" | "conditional" | "conditional_end" | "comment";
  meta?: Record<string, string>;
}

export type StepResult = {
  step: TestStep;
  status: "passed" | "failed" | "skipped";
  duration: number;
  attempts: HistoryEntry[];
  error?: string;
  /** Path to failure screenshot saved to disk */
  failureScreenshot?: string;
  /** Breakdown of time spent in VLM inference vs browser execution */
  timing?: {
    totalInferenceMs: number;
    totalExecutionMs: number;
  };
};

// ─── Test Suite ──────────────────────────────────────────────────────

export interface TestSuite {
  name: string;
  filePath: string;
  steps: TestStep[];
}

export interface TestRunResult {
  suite: TestSuite;
  results: StepResult[];
  startTime: number;
  endTime: number;
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  /** Aggregate timing breakdown for the entire run */
  timing?: {
    totalInferenceMs: number;
    totalExecutionMs: number;
  };
}

// ─── Configuration ──────────────────────────────────────────────────

export type AIProvider = "openai" | "anthropic" | "google" | "ollama";

export interface VouchConfig {
  /** AI provider to use for vision analysis */
  provider: AIProvider;
  /** Model identifier (e.g., "gpt-4o", "claude-sonnet-4-20250514", "gemini-2.0-flash") */
  model: string;
  /** API key for the chosen provider */
  apiKey?: string;
  /** Base URL override (for Ollama or proxies) */
  baseUrl?: string;
  /** Browser viewport width */
  viewportWidth: number;
  /** Browser viewport height */
  viewportHeight: number;
  /** Run browser in headless mode */
  headless: boolean;
  /** Maximum retry attempts per step (Actor-Critic loop) */
  maxRetries: number;
  /** Delay between actions in ms */
  actionDelay: number;
  /** Timeout per step in ms */
  stepTimeout: number;
  /** Generate JSON report */
  report: boolean;
  /** Report output directory */
  reportDir: string;
  /** Record video of the test session */
  recordVideo: boolean;
  /** Automatically process and remove idle frames from video using FFmpeg */
  consolidateVideo: boolean;
  /** Video output directory */
  videoDir: string;
  /** Record Playwright trace of the test session */
  recordTrace: boolean;
  /** Trace output directory */
  traceDir: string;
  /** Save a screenshot to disk when a step fails (for debugging) */
  screenshotOnFailure: boolean;
  /** Directory where failure screenshots are saved */
  screenshotDir: string;
  /** Enable verbose logging (shows AI reasoning, coordinates, timing breakdown) */
  verbose: boolean;
  /** File path to save and load browser auth state (cookies and localStorage) */
  storageState?: string;
}

export const DEFAULT_CONFIG: VouchConfig = {
  provider: "openai",
  model: "gpt-4o",
  viewportWidth: 1280,
  viewportHeight: 800,
  headless: false,
  maxRetries: 3,
  actionDelay: 50,
  stepTimeout: 30000,
  report: true,
  reportDir: "./.vouch/reports",
  recordVideo: false,
  consolidateVideo: false,
  videoDir: "./.vouch/videos",
  recordTrace: true, // Enable tracing by default instead of video
  traceDir: "./.vouch/traces",
  screenshotOnFailure: true, // Save failure screenshots by default
  screenshotDir: "./.vouch/screenshots",
  verbose: false,
};

// ─── AI Provider Interface ──────────────────────────────────────────

export interface AIProviderClient {
  analyze(
    systemPrompt: string,
    stepInstruction: string,
    imageBuffer: Buffer,
    historyLedger: HistoryEntry[],
    isAssertionLike?: boolean,
  ): Promise<VisionQAResponse>;
}

// ─── Browser Controller Interface ───────────────────────────────────

export interface BrowserActions {
  launch(): Promise<void>;
  close(): Promise<void>;
  navigate(url: string): Promise<void>;
  click(pixelX: number, pixelY: number): Promise<void>;
  doubleClick(pixelX: number, pixelY: number): Promise<void>;
  type(pixelX: number, pixelY: number, text: string): Promise<void>;
  wait(ms: number): Promise<void>;
  getViewportSize(): { width: number; height: number };
  /** Captures the current viewport as a JPEG buffer for the VLM. */
  captureViewport(): Promise<Buffer>;
  /** Enforces asynchronous hydration tasks finish executing. */
  waitForVisualSettle(timeout?: number): Promise<void>;
  getVideoPath(): string | null;
}
