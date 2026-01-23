/**
 * Browser Stealth Configuration
 * 
 * Advanced anti-detection measures for browser automation.
 * Implements techniques to avoid bot detection systems used by AI platforms.
 * 
 * Key Techniques:
 * 1. WebDriver property masking
 * 2. Navigator property spoofing
 * 3. Canvas/WebGL fingerprint randomization
 * 4. Timezone and locale consistency
 * 5. Human-like behavior patterns
 * 6. Realistic viewport and screen dimensions
 */

import type { BrowserContext, Page, LaunchOptions } from 'playwright';

// ===========================================
// Stealth Configuration Types
// ===========================================

export interface StealthConfig {
  // Browser fingerprint
  userAgent?: string;
  viewport?: { width: number; height: number };
  locale?: string;
  timezone?: string;
  
  // Anti-detection features
  maskWebdriver?: boolean;
  maskAutomation?: boolean;
  maskChrome?: boolean;
  maskPermissions?: boolean;
  maskPlugins?: boolean;
  maskLanguages?: boolean;
  
  // Behavior simulation
  humanizeTyping?: boolean;
  humanizeMouse?: boolean;
  humanizeClicks?: boolean;
  
  // Delays (in ms)
  minTypingDelay?: number;
  maxTypingDelay?: number;
  minClickDelay?: number;
  maxClickDelay?: number;
}

// ===========================================
// User Agent Rotation
// ===========================================

const REAL_USER_AGENTS = [
  // Chrome on macOS (most common)
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  // Chrome on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  // Chrome on Linux
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  // Safari on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  // Firefox on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  // Edge on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
];

const SCREEN_RESOLUTIONS = [
  { width: 1920, height: 1080, deviceScaleFactor: 1 },
  { width: 2560, height: 1440, deviceScaleFactor: 1 },
  { width: 1440, height: 900, deviceScaleFactor: 2 },  // Retina
  { width: 1680, height: 1050, deviceScaleFactor: 1 },
  { width: 1366, height: 768, deviceScaleFactor: 1 },
  { width: 2880, height: 1800, deviceScaleFactor: 2 }, // MacBook Pro Retina
];

const TIMEZONES = [
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Dubai',
];

const LOCALES = ['en-US', 'en-GB', 'en-AU', 'en-CA'];

// ===========================================
// Default Stealth Configuration
// ===========================================

export const DEFAULT_STEALTH_CONFIG: StealthConfig = {
  maskWebdriver: true,
  maskAutomation: true,
  maskChrome: true,
  maskPermissions: true,
  maskPlugins: true,
  maskLanguages: true,
  humanizeTyping: true,
  humanizeMouse: true,
  humanizeClicks: true,
  minTypingDelay: 30,
  maxTypingDelay: 150,
  minClickDelay: 50,
  maxClickDelay: 200,
};

// ===========================================
// Random Selection Helpers
// ===========================================

function randomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

// ===========================================
// Stealth Launch Options
// ===========================================

export function getStealthLaunchOptions(config: StealthConfig = {}): LaunchOptions {
  const mergedConfig = { ...DEFAULT_STEALTH_CONFIG, ...config };
  
  // Use non-headless if specified (sometimes helps bypass detection)
  const headless = process.env.BROWSER_HEADLESS !== 'false';
  
  return {
    headless,
    args: [
      // Disable automation flags (CRITICAL)
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--disable-dev-shm-usage',
      '--disable-browser-side-navigation',
      
      // Disable fingerprinting defenses that can be detected
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-features=BlockInsecurePrivateNetworkRequests',
      
      // GPU and rendering
      '--disable-gpu',
      '--disable-software-rasterizer',
      
      // Sandbox (may need to disable in Docker)
      '--no-sandbox',
      '--disable-setuid-sandbox',
      
      // Window settings
      '--window-position=0,0',
      '--window-size=1920,1080',
      
      // Reduce resource usage
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      
      // Disable extension/plugin checks
      '--disable-extensions',
      '--disable-plugins',
      
      // Additional stealth
      '--disable-web-security',
      '--allow-running-insecure-content',
      
      // Anti-detection flags
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-domain-reliability',
      '--disable-features=AudioServiceOutOfProcess',
      '--disable-hang-monitor',
      '--disable-prompt-on-repost',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--no-first-run',
      '--safebrowsing-disable-auto-update',
      '--enable-automation=false',
      '--password-store=basic',
      '--use-mock-keychain',
      
      // Cloudflare bypass
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
    ],
    ignoreDefaultArgs: [
      '--enable-automation',
      '--enable-blink-features=IdleDetection',
    ],
  };
}

// ===========================================
// Context Configuration with Fingerprint
// ===========================================

export interface StealthContextOptions {
  userAgent: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  locale: string;
  timezoneId: string;
  geolocation?: { latitude: number; longitude: number };
  permissions?: string[];
}

export function generateStealthContext(config: StealthConfig = {}): StealthContextOptions {
  const userAgent = config.userAgent || randomElement(REAL_USER_AGENTS);
  const screen = randomElement(SCREEN_RESOLUTIONS);
  const locale = config.locale || randomElement(LOCALES);
  const timezone = config.timezone || randomElement(TIMEZONES);
  
  return {
    userAgent,
    viewport: config.viewport || { width: screen.width, height: screen.height },
    deviceScaleFactor: screen.deviceScaleFactor,
    locale,
    timezoneId: timezone,
    permissions: ['geolocation', 'notifications'],
  };
}

// ===========================================
// Anti-Detection Script Injection
// ===========================================

/**
 * JavaScript to inject into pages to mask automation fingerprints
 */
export function getStealthScripts(config: StealthConfig = {}): string {
  const mergedConfig = { ...DEFAULT_STEALTH_CONFIG, ...config };
  
  const scripts: string[] = [];
  
  if (mergedConfig.maskWebdriver) {
    scripts.push(`
      // Remove webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true,
      });
      
      // Remove automation properties
      delete navigator.__proto__.webdriver;
    `);
  }
  
  if (mergedConfig.maskAutomation) {
    scripts.push(`
      // Remove automation indicators
      if (window.chrome) {
        window.chrome.runtime = undefined;
      }
      
      // Remove Playwright/Puppeteer detection
      delete window.__playwright;
      delete window.__puppeteer;
      delete window.__selenium;
      delete window.__nightmare;
      
      // Override permission query
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery.call(navigator.permissions, parameters)
      );
    `);
  }
  
  if (mergedConfig.maskChrome) {
    scripts.push(`
      // Fake Chrome runtime for detection evasion
      if (!window.chrome) {
        window.chrome = {};
      }
      window.chrome.csi = () => {};
      window.chrome.loadTimes = () => ({
        requestTime: Date.now() / 1000 - Math.random() * 100,
        startLoadTime: Date.now() / 1000 - Math.random() * 50,
        commitLoadTime: Date.now() / 1000 - Math.random() * 10,
        finishDocumentLoadTime: Date.now() / 1000 - Math.random() * 5,
        finishLoadTime: Date.now() / 1000,
        firstPaintTime: Date.now() / 1000 - Math.random() * 2,
        firstPaintAfterLoadTime: 0,
        navigationType: 'navigate',
        wasFetchedViaSpdy: false,
        wasNpnNegotiated: true,
        npnNegotiatedProtocol: 'h2',
        wasAlternateProtocolAvailable: false,
        connectionInfo: 'h2',
      });
      
      // Add chrome.app
      window.chrome.app = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      };
    `);
  }
  
  if (mergedConfig.maskPlugins) {
    scripts.push(`
      // Fake plugins array
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const plugins = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
          ];
          plugins.length = 3;
          return plugins;
        },
      });
      
      // Fake mimeTypes
      Object.defineProperty(navigator, 'mimeTypes', {
        get: () => {
          const mimeTypes = [
            { type: 'application/pdf', suffixes: 'pdf', description: '', enabledPlugin: { name: 'Chrome PDF Plugin' } },
          ];
          mimeTypes.length = 1;
          return mimeTypes;
        },
      });
    `);
  }
  
  if (mergedConfig.maskLanguages) {
    scripts.push(`
      // Consistent language settings
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      
      Object.defineProperty(navigator, 'language', {
        get: () => 'en-US',
      });
    `);
  }
  
  // Add hardware concurrency and memory spoofing
  scripts.push(`
    // Spoof hardware specs to common values
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => ${[4, 8, 12, 16][Math.floor(Math.random() * 4)]},
    });
    
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => ${[4, 8, 16][Math.floor(Math.random() * 3)]},
    });
    
    // Spoof connection info
    if (navigator.connection) {
      Object.defineProperty(navigator.connection, 'rtt', { get: () => ${randomBetween(50, 150)} });
      Object.defineProperty(navigator.connection, 'downlink', { get: () => ${randomFloat(5, 15).toFixed(1)} });
      Object.defineProperty(navigator.connection, 'effectiveType', { get: () => '4g' });
    }
  `);
  
  // Canvas fingerprint randomization
  scripts.push(`
    // Add slight noise to canvas to avoid fingerprinting
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type) {
      if (type === 'image/png' && this.width > 16 && this.height > 16) {
        const context = this.getContext('2d');
        if (context) {
          const imageData = context.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            // Add tiny random noise that's imperceptible but changes fingerprint
            imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + (Math.random() > 0.5 ? 1 : -1)));
          }
          context.putImageData(imageData, 0, 0);
        }
      }
      return originalToDataURL.apply(this, arguments);
    };
  `);
  
  // WebGL fingerprint protection
  scripts.push(`
    // Mask WebGL vendor/renderer
    const getParameterProxyHandler = {
      apply: function(target, thisArg, args) {
        const param = args[0];
        const gl = thisArg;
        
        // UNMASKED_VENDOR_WEBGL
        if (param === 37445) {
          return 'Intel Inc.';
        }
        // UNMASKED_RENDERER_WEBGL
        if (param === 37446) {
          return 'Intel Iris OpenGL Engine';
        }
        
        return target.apply(thisArg, args);
      }
    };
    
    const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = new Proxy(originalGetParameter, getParameterProxyHandler);
    
    if (typeof WebGL2RenderingContext !== 'undefined') {
      const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = new Proxy(originalGetParameter2, getParameterProxyHandler);
    }
  `);
  
  return scripts.join('\n\n');
}

// ===========================================
// Apply Stealth to Context
// ===========================================

/**
 * Apply stealth configuration to a browser context
 */
export async function applyStealthToContext(
  context: BrowserContext,
  config: StealthConfig = {}
): Promise<void> {
  const scripts = getStealthScripts(config);
  
  // Inject scripts before page content loads
  await context.addInitScript(scripts);
  
  // Use CDP (Chrome DevTools Protocol) to hide automation
  // This is more effective than JavaScript injection alone
  const pages = context.pages();
  for (const page of pages) {
    try {
      const client = await (page as any).context().newCDPSession(page);
      
      // Hide webdriver property via CDP
      await client.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
          Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
          });
          delete navigator.__proto__.webdriver;
          window.navigator.chrome = {
            runtime: {},
            loadTimes: function() {},
            csi: function() {},
            app: {}
          };
          window.chrome = window.navigator.chrome;
          delete window.__playwright;
          delete window.__puppeteer;
          delete window.__selenium;
        `,
      });
      
      // Override permissions
      await client.send('Browser.grantPermissions', {
        origin: page.url(),
        permissions: ['geolocation', 'notifications'],
      });
      
      // Override User-Agent metadata
      await client.send('Network.setUserAgentOverride', {
        userAgent: context.userAgent || REAL_USER_AGENTS[0],
        acceptLanguage: 'en-US,en;q=0.9',
        platform: 'Win32',
      });
    } catch (error) {
      // CDP might not be available in all contexts, continue without it
      console.warn('[Stealth] CDP commands not available, using JavaScript only');
    }
  }
  
  // Block known detection services
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    
    // Block known bot detection services
    const blockedPatterns = [
      'datadome.co',
      'perimeterx.net',
      'imperva.com',
      'distil.network',
      'kasada.io',
      'arkoselabs.com',
      'fingerprintjs.com',
      'recaptcha.net/recaptcha',
      'hcaptcha.com',
      'cloudflareinsights.com',
      'ray-id',
    ];
    
    if (blockedPatterns.some(pattern => url.includes(pattern))) {
      return route.abort('blockedbyclient');
    }
    
    return route.continue();
  });
}

// ===========================================
// Apply Stealth to Page
// ===========================================

/**
 * Apply stealth configuration to a specific page
 */
export async function applyStealthToPage(
  page: Page,
  config: StealthConfig = {}
): Promise<void> {
  const scripts = getStealthScripts(config);
  
  // Evaluate scripts immediately
  await page.addInitScript(scripts);
  
  // Also run immediately in case page already loaded
  await page.evaluate(scripts).catch(() => {
    // Ignore if page not ready
  });
}

// ===========================================
// Human-like Behavior Simulation
// ===========================================

/**
 * Type text with human-like random delays between keystrokes
 */
export async function humanType(
  page: Page,
  selector: string,
  text: string,
  config: StealthConfig = {}
): Promise<void> {
  const mergedConfig = { ...DEFAULT_STEALTH_CONFIG, ...config };
  
  const element = page.locator(selector);
  await element.click();
  
  for (const char of text) {
    await element.pressSequentially(char, {
      delay: randomBetween(
        mergedConfig.minTypingDelay!,
        mergedConfig.maxTypingDelay!
      ),
    });
    
    // Occasionally pause like a human thinking
    if (Math.random() < 0.05) {
      await page.waitForTimeout(randomBetween(200, 800));
    }
    
    // Occasional typo and correction (very rare)
    if (Math.random() < 0.01 && text.indexOf(char) < text.length - 3) {
      const wrongChar = 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
      await element.pressSequentially(wrongChar, { delay: randomBetween(50, 100) });
      await page.waitForTimeout(randomBetween(100, 300));
      await page.keyboard.press('Backspace');
    }
  }
}

/**
 * Move mouse to element with human-like curve
 */
export async function humanMouseMove(
  page: Page,
  selector: string,
  config: StealthConfig = {}
): Promise<void> {
  const element = page.locator(selector);
  const box = await element.boundingBox();
  
  if (!box) return;
  
  // Target point with slight randomness
  const targetX = box.x + box.width / 2 + randomBetween(-5, 5);
  const targetY = box.y + box.height / 2 + randomBetween(-5, 5);
  
  // Get current mouse position (approximate from viewport center)
  const viewport = page.viewportSize() || { width: 1920, height: 1080 };
  let currentX = viewport.width / 2 + randomBetween(-100, 100);
  let currentY = viewport.height / 2 + randomBetween(-100, 100);
  
  // Move in small steps with slight curve
  const steps = randomBetween(15, 30);
  
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    
    // Bezier-like curve with some randomness
    const easing = 1 - Math.pow(1 - progress, 3); // Ease out cubic
    
    const x = currentX + (targetX - currentX) * easing + randomBetween(-2, 2);
    const y = currentY + (targetY - currentY) * easing + randomBetween(-2, 2);
    
    await page.mouse.move(x, y);
    await page.waitForTimeout(randomBetween(5, 20));
  }
}

/**
 * Click with human-like delay and micro-movements
 */
export async function humanClick(
  page: Page,
  selector: string,
  config: StealthConfig = {}
): Promise<void> {
  const mergedConfig = { ...DEFAULT_STEALTH_CONFIG, ...config };
  
  // Move mouse to element first
  if (mergedConfig.humanizeMouse) {
    await humanMouseMove(page, selector, config);
  }
  
  // Small pause before clicking
  await page.waitForTimeout(randomBetween(
    mergedConfig.minClickDelay!,
    mergedConfig.maxClickDelay!
  ));
  
  // Click
  await page.locator(selector).click();
  
  // Small pause after clicking
  await page.waitForTimeout(randomBetween(100, 300));
}

/**
 * Scroll page like a human would
 */
export async function humanScroll(
  page: Page,
  direction: 'down' | 'up' = 'down',
  amount: number = 300
): Promise<void> {
  const scrollAmount = direction === 'down' ? amount : -amount;
  
  // Scroll in small increments
  const steps = randomBetween(5, 10);
  const stepAmount = scrollAmount / steps;
  
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, stepAmount + randomBetween(-10, 10));
    await page.waitForTimeout(randomBetween(30, 80));
  }
  
  // Pause after scrolling like reading
  await page.waitForTimeout(randomBetween(500, 1500));
}

/**
 * Wait with human-like randomness
 */
export async function humanWait(
  page: Page,
  baseMs: number = 1000,
  variance: number = 0.3
): Promise<void> {
  const actualWait = baseMs * (1 + (Math.random() * variance * 2 - variance));
  await page.waitForTimeout(Math.floor(actualWait));
}

// ===========================================
// Exports
// ===========================================

export const stealth = {
  getStealthLaunchOptions,
  generateStealthContext,
  getStealthScripts,
  applyStealthToContext,
  applyStealthToPage,
  humanType,
  humanMouseMove,
  humanClick,
  humanScroll,
  humanWait,
  randomElement,
  randomBetween,
};

export default stealth;

