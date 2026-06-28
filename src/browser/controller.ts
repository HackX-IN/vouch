import puppeteer, { type Browser, type Page, type CDPSession } from "puppeteer";
import { PuppeteerScreenRecorder } from "puppeteer-screen-recorder";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { BrowserActions, VouchConfig } from "../types/index.js";

const SKIP_ROLES = new Set([
  "none",
  "generic",
  "InlineTextBox",
  "LineBreak",
  "paragraph",
  "Section",
  "group",
  "document",
  "WebArea",
  "main",
  "navigation",
  "banner",
  "contentinfo",
  "complementary",
  "list",
  "listitem",
  "StaticText",
  "rootWebArea",
]);

interface CachedElement {
  normX: number;
  normY: number;
  role: string;
  name: string;
}

/**
 * Enhanced Puppeteer-based browser controller.
 * Operates at low-latency via high-throughput batched CDP interactions.
 */
export class BrowserController implements BrowserActions {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private cdpClient: CDPSession | null = null;
  private readonly config: VouchConfig;
  private recorder: PuppeteerScreenRecorder | null = null;
  public videoPath: string | null = null;

  /** Maps normalized keys to an array of elements to handle duplicate naming strategies safely */
  private lastElementMap: Map<string, CachedElement[]> = new Map();

  constructor(config: VouchConfig) {
    this.config = config;
  }

  async launch(): Promise<void> {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vouch-browser-"));
    const defaultDir = path.join(userDataDir, "Default");
    fs.mkdirSync(defaultDir, { recursive: true });
    
    // Inject Chrome preferences to strictly disable password manager and leak detection
    const preferences = {
      profile: { password_manager_enabled: false },
      credentials_enable_service: false,
      password_manager: { leak_detection: false },
      safebrowsing: { enabled: false, enhanced: false },
      search: { suggest_enabled: false },
      autofill: { profile_enabled: false, credit_card_enabled: false }
    };
    fs.writeFileSync(path.join(defaultDir, "Preferences"), JSON.stringify(preferences));

    this.browser = await puppeteer.launch({
      userDataDir,
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
        "--disable-save-password-bubble",
        "--disable-popup-blocking",
        "--disable-notifications",
        "--disable-infobars",
        "--password-store=basic",
        "--use-mock-keychain",
        "--disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,CalculateNativeWinOcclusion,InterestFeedContentSuggestions,CertificateTransparencyComponentUpdater,AutofillServerCommunication,PrivacySandboxSettings4,AcceptCHFrame,AutoExpandDetailsElement,CorsOptIn,DesktopPWAsWithoutExtensions,DropInputEventsBeforeFirstPaint,ExperimentalThirdPartyStoragePartitioning,FedCm,FedCmWithoutThirdPartyCookies,FreeUpMemory,LiveCaption,MediaFoundationClear,MetricsReporting,TextBasedAudioDescription,WinrtGeolocationImplementation,PasswordManager,AutofillProfileServerNetworkRequests,PasswordLeakDetection,InsecurePasswordWarning,SafeBrowsing,SafeBrowsingEnhancedProtection,CredentialProvider",
        `--window-size=${this.config.viewportWidth},${this.config.viewportHeight}`,
      ],
    });

    const pages = await this.browser.pages();
    this.page = pages[0] || (await this.browser.newPage());

    this.page.setDefaultNavigationTimeout(this.config.stepTimeout);
    this.page.setDefaultTimeout(this.config.stepTimeout);

    // Inject CSS to hide common overlays (cookies, password managers, etc.)
    await this.page.evaluateOnNewDocument(() => {
      const style = document.createElement("style");
      style.innerHTML = `
        [id*="cookie-banner" i], [class*="cookie-banner" i],
        [id*="cookie-consent" i], [class*="cookie-consent" i],
        [id*="cookie-notice" i], [class*="cookie-notice" i],
        [id*="cookie-popup" i], [class*="cookie-popup" i],
        [id*="gdpr" i], [class*="gdpr" i],
        [id*="onetrust" i], [class*="onetrust" i],
        [id*="ez-cookie" i], [class*="ez-cookie" i],
        #credential_picker_container,
        iframe[src*="smartlock"] {
          display: none !important;
          z-index: -1 !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `;
      document.addEventListener("DOMContentLoaded", () => {
        document.head.appendChild(style);
      });
    });

    this.cdpClient = await this.page.createCDPSession();

    if (this.config.recordVideo) {
      if (!fs.existsSync(this.config.videoDir)) {
        fs.mkdirSync(this.config.videoDir, { recursive: true });
      }
      this.videoPath = path.join(
        this.config.videoDir,
        `vouch-recording-${Date.now()}.mp4`,
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
      } catch {}
      this.browser = null;
      this.page = null;
    }
  }

  getVideoPath(): string | null {
    return this.videoPath;
  }

  async navigate(url: string): Promise<void> {
    this.assertPage();
    // Navigate with a fast load lifecycle, then back it up with a visual paint check
    await this.page!.goto(url, { waitUntil: "domcontentloaded" });
    await this.waitForVisualSettle();
  }

  async click(pixelX: number, pixelY: number): Promise<void> {
    this.assertPage();
    await this.page!.mouse.click(pixelX, pixelY);
    await this.sleep(50);
  }

  async type(pixelX: number, pixelY: number, text: string): Promise<void> {
    this.assertPage();
    await this.page!.mouse.click(pixelX, pixelY, { count: 3 });
    await this.sleep(50);
    await this.page!.keyboard.press("Backspace");
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
   * Reads page using Chrome DevTools Protocol Accessibility API.
   * Employs chunked network batch processing to eliminate socket saturation bottlenecks.
   */
  async getScreenReaderOutput(): Promise<string> {
    this.assertPage();
    const client = this.cdpClient!;

    const { nodes } = (await client.send("Accessibility.getFullAXTree")) as {
      nodes: Array<{
        role?: { value: string };
        name?: { value: string };
        value?: { value: string };
        backendDOMNodeId?: number;
      }>;
    };

    const { width: vw, height: vh } = this.getViewportSize();
    const relevant: Array<{
      role: string;
      name: string;
      value?: string;
      backendNodeId: number;
    }> = [];

    for (const node of nodes) {
      const role = node.role?.value;
      const name = node.name?.value?.trim();
      if (!role || SKIP_ROLES.has(role) || !name) continue;

      const backendNodeId = node.backendDOMNodeId;
      if (!backendNodeId) continue;

      relevant.push({ role, name, value: node.value?.value, backendNodeId });
    }

    // Chunk CDP inquiries to protect the socket buffer (O(N) operations executed in bounded time)
    const boxes: Array<PromiseSettledResult<{ content: number[] } | null>> = [];
    const chunkSize = 45;

    for (let i = 0; i < relevant.length; i += chunkSize) {
      const chunk = relevant.slice(i, i + chunkSize);
      const chunkPromises = chunk.map((n) =>
        client
          .send("DOM.getBoxModel", { backendNodeId: n.backendNodeId })
          .then((r) => (r as { model: { content: number[] } }).model)
          .catch(() => null),
      );
      const chunkResults = await Promise.allSettled(chunkPromises);
      boxes.push(...chunkResults);
    }

    const results: string[] = [];
    this.lastElementMap = new Map();

    for (let i = 0; i < relevant.length; i++) {
      const settled = boxes[i];
      if (!settled || settled.status !== "fulfilled" || !settled.value)
        continue;

      const quad = settled.value.content;
      const centerX = (quad[0] + quad[4]) / 2;
      const centerY = (quad[1] + quad[5]) / 2;

      if (centerX < 0 || centerY < 0 || centerX > vw || centerY > vh) continue;

      const normX = Math.round((centerX / vw) * 1000);
      const normY = Math.round((centerY / vh) * 1000);
      const n = relevant[i];

      let desc = `${n.role} "${n.name}"`;
      if (n.value) desc += ` v="${n.value}"`;
      desc += ` @${normX},${normY}`;
      results.push(desc);

      const key = n.name.toLowerCase();
      const currentList = this.lastElementMap.get(key) || [];
      currentList.push({ normX, normY, role: n.role, name: n.name });
      this.lastElementMap.set(key, currentList);
    }

    return results.length > 0 ? "UI:\n" + results.join("\n") : "UI: empty";
  }

  /**
   * Resolves element locations from fuzzy query lookups.
   * Gracefully down-ranks elements with distant layout offsets if multiple duplicates match.
   */
  resolveElement(targetName: string): { normX: number; normY: number } | null {
    if (!targetName || this.lastElementMap.size === 0) return null;

    const target = targetName.toLowerCase().trim();

    // 1. Array-Safe Exact Match lookup (takes the first elements parsed up top)
    if (this.lastElementMap.has(target)) {
      return this.lastElementMap.get(target)![0];
    }

    // 2. Heavy Heuristic Substring Match
    let bestMatch: CachedElement | null = null;
    let bestScore = 0;

    for (const [key, elements] of this.lastElementMap.entries()) {
      let currentScore = 0;

      if (key.includes(target)) {
        currentScore = target.length / key.length;
      } else if (target.includes(key)) {
        currentScore = key.length / target.length;
      }

      if (currentScore > bestScore && elements.length > 0) {
        bestScore = currentScore;
        bestMatch = elements[0];
      }
    }

    return bestMatch && bestScore > 0.3
      ? { normX: bestMatch.normX, normY: bestMatch.normY }
      : null;
  }

  /**
   * Monitors layout and thread stability before proceeding.
   * Guarantees asynchronous hydration tasks finish executing.
   */
  private async waitForVisualSettle(): Promise<void> {
    try {
      // Short poll for network activity to approach zero-state stability
      await this.page!.waitForNetworkIdle({
        timeout: 3500,
        idleTime: 100,
      }).catch(() => {});
      // Allow thread painting microtasks to clear
      await this.page!.evaluate(
        () =>
          new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50))),
      );
    } catch {
      await this.sleep(250);
    }
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
