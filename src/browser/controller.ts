import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";
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
  public tracePath: string | null = null;

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
      let storageState: string | undefined;
      if (this.config.storageState) {
        const statePath = path.resolve(this.config.storageState);
        if (fs.existsSync(statePath)) {
          storageState = statePath;
        }
      }

      this.context = await globalBrowser.newContext({
        viewport: {
          width: this.config.viewportWidth,
          height: this.config.viewportHeight,
        },
        recordVideo,
        storageState,
        ignoreHTTPSErrors: true,
        reducedMotion: "reduce",
      });

      // 4. Create and configure page
      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(this.config.stepTimeout);
      this.page.setDefaultNavigationTimeout(this.config.stepTimeout);

      // 5. Register asset-blocking route once, globally for this context.
      //    Re-registering per navigate() stacks interceptors — this is the correct fix.
      await this.page.route("**/*", (route) => {
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

      // 6. Start Tracing
      if (this.config.recordTrace) {
        if (!fs.existsSync(this.config.traceDir)) {
          fs.mkdirSync(this.config.traceDir, { recursive: true });
        }
        await this.context.tracing.start({ screenshots: true, snapshots: true });
      }

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
        if (this.config.storageState) {
          try {
            const statePath = path.resolve(this.config.storageState);
            const dir = path.dirname(statePath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            await this.context.storageState({ path: statePath });
          } catch (error) {
            console.error(`Failed to save storage state: ${(error as Error).message}`);
          }
        }
        if (this.config.recordTrace) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          this.tracePath = path.join(this.config.traceDir, `trace-${timestamp}.zip`);
          await this.context.tracing.stop({ path: this.tracePath }).catch(() => {});
        }
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

  getTracePath(): string | null {
    return this.tracePath;
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
      if (parsed.hostname === "169.254.169.254") {
        throw new Error("AWS Metadata SSRF target blocked.");
      }
    } catch (e) {
      throw new Error(`URL Validation Failed: ${(e as Error).message}`);
    }
  }

  /**
   * Navigates to target URL. Route blocking is set up once in launch() —
   * no interceptors registered here to avoid stacking handlers on repeat navigation.
   */
  async navigate(url: string): Promise<void> {
    this.assertPage();
    this.validateUrl(url);

    try {
      await this.page!.goto(url, { waitUntil: "domcontentloaded" });
      await this.waitForVisualSettle();
    } catch (error) {
      throw new Error(`Navigation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Captures the current viewport for the VLM.
   * - assertion mode: lossless PNG so text/UI details are pixel-perfect
   * - action mode: high-quality JPEG (configurable) for smaller payload
   */
  async captureViewport(mode: "action" | "assertion" = "action"): Promise<{ buffer: Buffer; mimeType: "image/jpeg" | "image/png" }> {
    this.assertPage();
    try {
      const usePng = mode === "assertion" && this.config.assertionScreenshotPng;
      if (usePng) {
        const buffer = await this.page!.screenshot({
          type: "png",
          animations: "disabled",
          fullPage: false,
        });
        return { buffer, mimeType: "image/png" };
      }
      const buffer = await this.page!.screenshot({
        type: "jpeg",
        quality: this.config.screenshotQuality,
        animations: "disabled",
        fullPage: false,
      });
      return { buffer, mimeType: "image/jpeg" };
    } catch (error) {
      throw new Error(`Failed to capture viewport: ${(error as Error).message}`);
    }
  }

  /** Saves a full-page screenshot to a named path for @screenshot steps. */
  async saveScreenshot(filePath: string): Promise<void> {
    this.assertPage();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await this.page!.screenshot({ path: filePath, type: "png", fullPage: false });
  }

  /** Hardware-level mouse click on specific coordinates */
  async click(pixelX: number, pixelY: number): Promise<void> {
    this.assertPage();
    try {
      await this.page!.mouse.click(pixelX, pixelY);
      await this.sleep(this.config.actionDelay);
    } catch (e) {
      throw new Error(`Click interaction failed: ${(e as Error).message}`);
    }
  }

  /** Hardware-level mouse double click */
  async doubleClick(pixelX: number, pixelY: number): Promise<void> {
    this.assertPage();
    try {
      await this.page!.mouse.click(pixelX, pixelY, { clickCount: 2 });
      await this.sleep(this.config.actionDelay);
    } catch (e) {
      throw new Error(
        `Double click interaction failed: ${(e as Error).message}`,
      );
    }
  }

  /** Hardware-level type simulation with triple-click clearing */
  async type(pixelX: number, pixelY: number, text: string): Promise<void> {
    this.assertPage();
    try {
      await this.page!.mouse.click(pixelX, pixelY, { clickCount: 3 });
      await this.sleep(this.config.actionDelay);
      await this.page!.keyboard.press("Backspace");
      await this.page!.keyboard.type(text, { delay: 15 });
      await this.sleep(this.config.actionDelay);
    } catch (e) {
      throw new Error(`Type interaction failed: ${(e as Error).message}`);
    }
  }

  /** Mouse wheel scroll at a specific position */
  async scroll(pixelX: number, pixelY: number, deltaX: number, deltaY: number): Promise<void> {
    this.assertPage();
    try {
      await this.page!.mouse.move(pixelX, pixelY);
      await this.page!.mouse.wheel(deltaX, deltaY);
    } catch (e) {
      throw new Error(`Scroll interaction failed: ${(e as Error).message}`);
    }
  }

  /** Absolute scroll to top or bottom of the page */
  async scrollTo(position: "top" | "bottom"): Promise<void> {
    this.assertPage();
    await this.page!.evaluate((pos) => {
      window.scrollTo({
        top: pos === "bottom" ? document.body.scrollHeight : 0,
        behavior: "smooth",
      });
    }, position);
    await this.sleep(600);
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

  /** Exposes the Playwright Page for escape-hatch operations */
  getPage(): Page {
    this.assertPage();
    return this.page!;
  }

  /**
   * Waits for pending network + animation microtasks to settle.
   */
  public async waitForVisualSettle(timeout: number = 2000): Promise<void> {
    try {
      await this.page!.waitForLoadState("domcontentloaded", { timeout }).catch(
        () => {},
      );
      await this.page!.evaluate(
        () =>
          new Promise((r) => requestAnimationFrame(() => setTimeout(r, 100))),
      );
    } catch {
      await this.sleep(100);
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
