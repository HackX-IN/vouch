import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Route,
} from "playwright";
import * as fs from "node:fs";
import { URL } from "node:url";
import type { BrowserActions, VouchConfig } from "../types/index.js";

// Global singleton browser instance to prevent cold-starts across visual crawls
let globalBrowser: Browser | null = null;

/**
 * Playwright-based browser controller using a warm singleton architecture.
 * Operates strictly on a vision-canvas basis without DOM interaction.
 */
export class BrowserController implements BrowserActions {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly config: VouchConfig;
  public videoPath: string | null = null;

  constructor(config: VouchConfig) {
    this.config = config;
  }

  /**
   * Initializes the warm singleton browser instance if not already running.
   * Creates a fresh, isolated Browser Context for the session.
   */
  async launch(): Promise<void> {
    try {
      // 1. Ensure global browser is warm
      if (!globalBrowser) {
        globalBrowser = await chromium.launch({
          headless: this.config.headless,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-sync",
            "--disable-translate",
            "--metrics-recording-only",
            "--no-first-run",
            "--disable-popup-blocking",
            "--disable-notifications",
            "--disable-infobars",
          ],
        });
      }

      // 2. Prepare recording configuration if enabled
      let recordVideo:
        | { dir: string; size: { width: number; height: number } }
        | undefined;
      if (this.config.recordVideo) {
        if (!fs.existsSync(this.config.videoDir)) {
          fs.mkdirSync(this.config.videoDir, { recursive: true });
        }
        recordVideo = {
          dir: this.config.videoDir,
          size: {
            width: this.config.viewportWidth,
            height: this.config.viewportHeight,
          },
        };
      }

      // 3. Create fresh ephemeral context
      this.context = await globalBrowser.newContext({
        viewport: {
          width: this.config.viewportWidth,
          height: this.config.viewportHeight,
        },
        recordVideo,
        ignoreHTTPSErrors: true,
        reducedMotion: "reduce", // Enforce reduced motion accessibility settings natively
      });

      // 4. Create and configure page
      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(this.config.stepTimeout);
      this.page.setDefaultNavigationTimeout(this.config.stepTimeout);

      if (this.config.recordVideo && this.page.video()) {
        this.videoPath = await this.page.video()!.path();
      }
    } catch (error) {
      await this.close();
      throw new Error(
        `Failed to launch browser context: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Cleans up the ephemeral context properly.
   * The global Browser remains warm for future test runs.
   */
  async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close().catch(() => {});
        this.page = null;
      }
      if (this.context) {
        await this.context.close().catch(() => {});
        this.context = null;
      }
    } catch (error) {
      console.error(`Error during browser close: ${(error as Error).message}`);
    }
  }

  getVideoPath(): string | null {
    return this.videoPath;
  }

  /**
   * Validates URLs to prevent SSRF and execution attacks.
   */
  private validateUrl(targetUrl: string): void {
    try {
      const parsed = new URL(targetUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Invalid protocol. Only HTTP and HTTPS are permitted.");
      }
      // Simple localhost SSRF check - can be expanded based on environment needs
      if (parsed.hostname === "169.254.169.254") {
        throw new Error("AWS Metadata SSRF target blocked.");
      }
    } catch (e) {
      throw new Error(`URL Validation Failed: ${(e as Error).message}`);
    }
  }

  /**
   * Navigates to target URL with performance optimizations.
   * Blocks heavy assets (images, fonts, media, analytics) for <2s execution.
   */
  async navigate(url: string): Promise<void> {
    this.assertPage();
    this.validateUrl(url);

    try {
      // Use page.route to block heavy non-structural assets
      await this.page!.route("**/*", (route: Route) => {
        const req = route.request();
        const type = req.resourceType();
        const urlStr = req.url().toLowerCase();

        const isAnalytics =
          urlStr.includes("google-analytics") ||
          urlStr.includes("analytics") ||
          urlStr.includes("mixpanel") ||
          urlStr.includes("doubleclick") ||
          urlStr.includes("tracker");

        if (isAnalytics || ["image", "media", "font"].includes(type)) {
          route.abort().catch(() => {});
        } else {
          route.continue().catch(() => {});
        }
      });

      await this.page!.goto(url, { waitUntil: "domcontentloaded" });
      await this.waitForVisualSettle();
    } catch (error) {
      throw new Error(`Navigation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Captures the current viewport as a JPEG buffer for the VLM.
   * Forces 50% quality and disabled animations for performance.
   */
  async captureViewport(): Promise<Buffer> {
    this.assertPage();
    try {
      return await this.page!.screenshot({
        type: "jpeg",
        quality: 30,
        animations: "disabled", // Force disable CSS animations to prevent flakiness
        fullPage: false, // Strictly viewport-bound interaction
      });
    } catch (error) {
      throw new Error(
        `Failed to capture viewport: ${(error as Error).message}`,
      );
    }
  }

  /** Hardware-level mouse click on specific coordinates */
  async click(pixelX: number, pixelY: number): Promise<void> {
    this.assertPage();
    try {
      await this.page!.mouse.click(pixelX, pixelY);
      await this.sleep(50);
    } catch (e) {
      throw new Error(`Click interaction failed: ${(e as Error).message}`);
    }
  }

  /** Hardware-level mouse double click */
  async doubleClick(pixelX: number, pixelY: number): Promise<void> {
    this.assertPage();
    try {
      await this.page!.mouse.click(pixelX, pixelY, { clickCount: 2 });
      await this.sleep(50);
    } catch (e) {
      throw new Error(
        `Double click interaction failed: ${(e as Error).message}`,
      );
    }
  }

  /** Hardware-level type simulation with clearing */
  async type(pixelX: number, pixelY: number, text: string): Promise<void> {
    this.assertPage();
    try {
      await this.page!.mouse.click(pixelX, pixelY, { clickCount: 3 });
      await this.sleep(50);
      await this.page!.keyboard.press("Backspace");
      await this.page!.keyboard.type(text, { delay: 15 });
      await this.sleep(50);
    } catch (e) {
      throw new Error(`Type interaction failed: ${(e as Error).message}`);
    }
  }

  async wait(ms: number): Promise<void> {
    await this.sleep(ms);
  }

  getViewportSize(): { width: number; height: number } {
    return {
      width: this.config.viewportWidth,
      height: this.config.viewportHeight,
    };
  }

  /** Exposes the Playwright Page if advanced escape hatches are strictly needed */
  getPage(): Page {
    this.assertPage();
    return this.page!;
  }

  /**
   * Enforces asynchronous hydration tasks finish executing.
   */
  public async waitForVisualSettle(timeout: number = 3500): Promise<void> {
    try {
      await this.page!.waitForLoadState("domcontentloaded", { timeout }).catch(
        () => {},
      );
      // Allow thread painting microtasks to clear
      await this.page!.evaluate(
        () =>
          new Promise((r) => requestAnimationFrame(() => setTimeout(r, 150))),
      );
    } catch {
      await this.sleep(150);
    }
  }

  private assertPage(): void {
    if (!this.page) {
      throw new Error("Browser Context is not launched. Call launch() first.");
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
