// ─── Core Action Types ───────────────────────────────────────────────

/** Action type is a free string — AI can output any action (click, type, scroll, hover, keypress, etc.) */
export type ActionType = string;

/** Terminal actions that signal the end of a step. */
export const TERMINAL_ACTIONS = ["complete", "fail"] as const;

export interface VisionQAResponse {
  reasoning: string;
  action: ActionType;
  x: number;
  y: number;
  textPayload: string;
  detectedValidationError: string;
  /** Optional: the name/label of the target element from the UI tree */
  targetElement?: string;
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
}

// ─── Test Step ───────────────────────────────────────────────────────

export interface TestStep {
  lineNumber: number;
  raw: string;
  instruction: string;
  type: "navigate" | "action" | "assert" | "wait" | "conditional" | "comment";
  meta?: Record<string, string>;
}

export type StepResult = {
  step: TestStep;
  status: "passed" | "failed" | "skipped";
  duration: number;
  attempts: HistoryEntry[];
  error?: string;
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
  /** Video output directory */
  videoDir: string;
}

export const DEFAULT_CONFIG: VouchConfig = {
  provider: "openai",
  model: "gpt-4o",
  viewportWidth: 1280,
  viewportHeight: 800,
  headless: false,
  maxRetries: 3,
  actionDelay: 200,
  stepTimeout: 30000,
  report: true,
  reportDir: "./.vouch/reports",
  recordVideo: false,
  videoDir: "./.vouch/videos",
};

// ─── AI Provider Interface ──────────────────────────────────────────

export interface AIProviderClient {
  analyze(
    systemPrompt: string,
    stepInstruction: string,
    screenReaderOutput: string,
    historyLedger: HistoryEntry[]
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
  /** Uses Chrome Accessibility API (screen reader) to read the page — zero selectors. */
  getScreenReaderOutput(): Promise<string>;
  getVideoPath(): string | null;
}
