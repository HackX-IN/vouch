import puppeteer, { type Browser, type Page, type CDPSession } from "puppeteer";
import { PuppeteerScreenRecorder } from "puppeteer-screen-recorder";
import * as fs from "node:fs";
import * as path from "node:path";
import type { BrowserActions, VouchConfig } from "../types/index.js";

/** Hoisted for performance — avoid recreating per call */
const SKIP_ROLES = new Set([
  "none", "generic", "InlineTextBox", "LineBreak",
  "paragraph", "Section", "group", "document",
  "WebArea", "main", "navigation", "banner",
  "contentinfo", "complementary", "list", "listitem",
  "StaticText", "rootWebArea",
]);

/**
 * Puppeteer-based browser controller.
 *
 * Uses Chrome DevTools Protocol Accessibility API (screen reader)
 * to understand the page — zero CSS/XPath selectors.
 *
 * Optimized for low-latency execution:
 * - Persistent CDP session (no create/detach per call)
 * - Batched box model resolution
 * - Minimal sleep timers
 * - Instant keyboard typing
 */
export class BrowserController implements BrowserActions {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private cdpClient: CDPSession | null = null;
  private config: VouchConfig;
  private recorder: PuppeteerScreenRecorder | null = null;
  public videoPath: string | null = null;
  /** Caches element names → normalized coordinates from the last AX tree scan */
  private lastElementMap: Map<string, { normX: number; normY: number; role: string; name: string }> = new Map();

  constructor(config: VouchConfig) {
    this.config = config;
  }

  async launch(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      defaultViewport: {
        width: this.config.viewportWidth,
        height: this.config.viewportHeight,
      },
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
        `--window-size=${this.config.viewportWidth},${this.config.viewportHeight}`,
      ],
    });

    const pages = await this.browser.pages();
    this.page = pages[0] || (await this.browser.newPage());

    // Set a reasonable navigation timeout
    this.page.setDefaultNavigationTimeout(this.config.stepTimeout);
    this.page.setDefaultTimeout(this.config.stepTimeout);

    // Create a persistent CDP session — reused for all accessibility reads
    this.cdpClient = await this.page.createCDPSession();

    if (this.config.recordVideo) {
      if (!fs.existsSync(this.config.videoDir)) {
        fs.mkdirSync(this.config.videoDir, { recursive: true });
      }
      this.videoPath = path.join(
        this.config.videoDir,
        `vouch-recording-${Date.now()}.mp4`
      );
      this.recorder = new PuppeteerScreenRecorder(this.page);
      await this.recorder.start(this.videoPath);
    }
  }

  async close(): Promise<void> {
    if (this.recorder) {
      try {
        await this.recorder.stop();
      } catch {}
      this.recorder = null;
    }

    if (this.cdpClient) {
      try {
        await this.cdpClient.detach();
      } catch {}
      this.cdpClient = null;
    }

    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore errors during close
      }
      this.browser = null;
      this.page = null;
    }
  }

  getVideoPath(): string | null {
    return this.videoPath;
  }

  async navigate(url: string): Promise<void> {
    this.assertPage();
    // domcontentloaded is significantly faster than networkidle2
    await this.page!.goto(url, { waitUntil: "domcontentloaded" });
    // Brief settle for JS-rendered content
    await this.sleep(150);
  }

  async click(pixelX: number, pixelY: number): Promise<void> {
    this.assertPage();
    await this.page!.mouse.click(pixelX, pixelY);
    await this.sleep(50);
  }

  async type(pixelX: number, pixelY: number, text: string): Promise<void> {
    this.assertPage();
    // Triple-click to select all, then overwrite
    await this.page!.mouse.click(pixelX, pixelY, { count: 3 });
    await this.sleep(50);
    await this.page!.keyboard.press("Backspace");
    // Instant typing — no per-character delay
    await this.page!.keyboard.type(text, { delay: 0 });
    await this.sleep(50);
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

  getPage(): Page {
    this.assertPage();
    return this.page!;
  }

  /**
   * Uses Chrome DevTools Protocol Accessibility API to read the page
   * like a screen reader. Returns a textual description of all visible
   * interactive elements with their normalized (0-1000) coordinates.
   *
   * Performance: reuses persistent CDP session and batches box model lookups.
   */
  async getScreenReaderOutput(): Promise<string> {
    this.assertPage();
    const client = this.cdpClient!;

    const { nodes } = await client.send("Accessibility.getFullAXTree") as {
      nodes: Array<{
        role?: { value: string };
        name?: { value: string };
        value?: { value: string };
        backendDOMNodeId?: number;
      }>
    };

    const { width: vw, height: vh } = this.getViewportSize();

    // Roles we skip — structural containers, not interactive
    const skipRoles = SKIP_ROLES;

    // Phase 1: Filter relevant nodes (CPU-only, instant)
    type RelevantNode = {
      role: string;
      name: string;
      value?: string;
      backendNodeId: number;
    };
    const relevant: RelevantNode[] = [];
    for (const node of nodes) {
      const role = node.role?.value;
      const name = node.name?.value?.trim();
      if (!role || skipRoles.has(role) || !name || name === "") continue;
      const backendNodeId = node.backendDOMNodeId;
      if (!backendNodeId) continue;
      relevant.push({ role, name, value: node.value?.value, backendNodeId });
    }

    // Phase 2: Batch resolve box models in parallel
    const boxPromises = relevant.map((n) =>
      client
        .send("DOM.getBoxModel", { backendNodeId: n.backendNodeId })
        .then((r) => (r as { model: { content: number[] } }).model)
        .catch(() => null)
    );
    const boxes = await Promise.allSettled(boxPromises);

    // Phase 3: Build compressed output and element map
    const results: string[] = [];
    this.lastElementMap = new Map();

    for (let i = 0; i < relevant.length; i++) {
      const settled = boxes[i];
      if (settled.status !== "fulfilled" || !settled.value) continue;
      const model = settled.value;
      const quad = model.content;
      const centerX = (quad[0] + quad[4]) / 2;
      const centerY = (quad[1] + quad[5]) / 2;
      if (centerX < 0 || centerY < 0 || centerX > vw || centerY > vh) continue;

      const normX = Math.round((centerX / vw) * 1000);
      const normY = Math.round((centerY / vh) * 1000);
      const n = relevant[i];
      // Terse format: role "name" [val] @x,y
      let desc = `${n.role} "${n.name}"`;
      if (n.value) desc += ` v="${n.value}"`;
      desc += ` @${normX},${normY}`;
      results.push(desc);

      // Store in element map for smart resolution
      // Key by lowercased name for fuzzy matching
      const key = n.name.toLowerCase();
      if (!this.lastElementMap.has(key)) {
        this.lastElementMap.set(key, { normX, normY, role: n.role, name: n.name });
      }
    }

    return results.length > 0
      ? "UI:\n" + results.join("\n")
      : "UI: empty";
  }

  /**
   * Resolve an element's real coordinates from the last AX tree scan.
   * Uses fuzzy substring matching to handle slight naming mismatches.
   * Returns normalized (0-1000) coordinates or null if no match.
   */
  resolveElement(targetName: string): { normX: number; normY: number } | null {
    if (!targetName || this.lastElementMap.size === 0) return null;

    const target = targetName.toLowerCase().trim();

    // 1. Exact match
    if (this.lastElementMap.has(target)) {
      return this.lastElementMap.get(target)!;
    }

    // 2. Substring match — find elements whose name contains the target or vice versa
    let bestMatch: { normX: number; normY: number } | null = null;
    let bestScore = 0;

    for (const [key, val] of this.lastElementMap.entries()) {
      // Target is substring of element name
      if (key.includes(target)) {
        const score = target.length / key.length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = val;
        }
      }
      // Element name is substring of target
      if (target.includes(key)) {
        const score = key.length / target.length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = val;
        }
      }
    }

    // Only accept if match quality is reasonable (>30%)
    if (bestMatch && bestScore > 0.3) {
      return bestMatch;
    }

    return null;
  }

  private assertPage(): void {
    if (!this.page) {
      throw new Error("Browser not launched. Call launch() first.");
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
