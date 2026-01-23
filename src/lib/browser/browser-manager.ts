/**
 * Browser Manager
 * 
 * Manages Playwright browser instances, sessions, and authentication
 * for front-end answer capture from AI engines.
 * 
 * Features:
 * - Browser pool for parallel captures
 * - Session persistence (cookies, localStorage)
 * - Auto-reconnect on session expiry
 * - Rate limiting to avoid detection
 * - Advanced stealth mode to avoid bot detection
 * - Human-like behavior simulation
 * - Residential proxy rotation
 * - Advanced fingerprint spoofing
 * - Isolated browser profiles
 * - Distributed rate limiting
 * 
 * NOTE: Playwright is loaded dynamically to avoid bundling issues.
 * This module requires playwright to be installed: npm install playwright
 */

import type { Browser, BrowserContext, Page } from 'playwright';
import type { 
  SupportedEngine,
  BrowserOptions,
  BrowserPoolConfig,
  AuthCredentials,
} from './types';
import { DEFAULT_BROWSER_POOL_CONFIG } from './types';
import {
  getStealthLaunchOptions,
  generateStealthContext,
  applyStealthToContext,
} from './stealth';
import { getSessionStorage } from './session-storage';
import { getAuthCredentials, hasCredentials } from './config';

// NEW: Import advanced anti-detection modules
import { getProxyManager, hasProxySupport, type ProxyConfig } from './proxy-manager';
import { getFingerprintGenerator, getFingerprintScript, type BrowserFingerprint } from './fingerprint-generator';
import { getProfileManager, type BrowserProfile } from './profile-manager';
import { getRateLimiter } from './rate-limiter';

// Dynamic import for Playwright to avoid bundling issues
async function getChromium() {
  const playwright = await import('playwright');
  return playwright.chromium;
}

// ===========================================
// Engine URLs
// ===========================================

export const ENGINE_URLS: Record<SupportedEngine, string> = {
  chatgpt: 'https://chatgpt.com',  // Updated from chat.openai.com
  perplexity: 'https://www.perplexity.ai',
  gemini: 'https://gemini.google.com',
  grok: 'https://grok.x.ai',
};

export const ENGINE_LOGIN_URLS: Record<SupportedEngine, string> = {
  chatgpt: 'https://auth.openai.com/authorize',
  perplexity: 'https://www.perplexity.ai/login',
  gemini: 'https://accounts.google.com',
  grok: 'https://twitter.com/i/flow/login',
};

// ===========================================
// Browser Pool Instance
// ===========================================

interface BrowserInstance {
  browser: Browser;
  contexts: Map<string, BrowserContext>;
  pageCount: number;
  lastUsed: number;
  isClosing: boolean;
}

interface PooledPage {
  page: Page;
  context: BrowserContext;
  engine: SupportedEngine;
  sessionId: string;
  lastUsed: number;
  profile?: BrowserProfile;
  proxy?: ProxyConfig;
  fingerprint?: BrowserFingerprint;
}

export class BrowserPool {
  private instances: BrowserInstance[] = [];
  private pages: Map<string, PooledPage> = new Map();
  private config: BrowserPoolConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private stealthEnabled: boolean = true;
  private proxyEnabled: boolean = false;
  private profilesEnabled: boolean = true;

  constructor(config: Partial<BrowserPoolConfig> = {}) {
    this.config = { ...DEFAULT_BROWSER_POOL_CONFIG, ...config };
    this.stealthEnabled = process.env.BROWSER_STEALTH_MODE !== 'false';
    this.proxyEnabled = hasProxySupport();
    this.profilesEnabled = process.env.BROWSER_PROFILES_ENABLED !== 'false';
  }

  async initialize(): Promise<void> {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
    
    // Initialize profile manager if enabled
    if (this.profilesEnabled) {
      try {
        await getProfileManager();
        console.log('[BrowserPool] Profile manager initialized');
      } catch (e) {
        console.warn('[BrowserPool] Failed to initialize profile manager:', e);
        this.profilesEnabled = false;
      }
    }
    
    // Initialize proxy manager if proxies are configured
    if (this.proxyEnabled) {
      try {
        await getProxyManager();
        console.log('[BrowserPool] Proxy manager initialized');
      } catch (e) {
        console.warn('[BrowserPool] Failed to initialize proxy manager:', e);
        this.proxyEnabled = false;
      }
    }
    
    console.log('[BrowserPool] Initialized with config:', {
      ...this.config,
      stealth: this.stealthEnabled,
      proxies: this.proxyEnabled,
      profiles: this.profilesEnabled,
    });
  }

  async getBrowser(): Promise<Browser> {
    // Find available browser or create new one
    const available = this.instances.find(
      i => !i.isClosing && i.pageCount < this.config.max_pages_per_browser
    );

    if (available) {
      available.lastUsed = Date.now();
      return available.browser;
    }

    if (this.instances.length >= this.config.max_browsers) {
      // Wait for one to become available
      await this.waitForAvailableBrowser();
      return this.getBrowser();
    }

    // Launch new browser with stealth options if enabled
    const chromium = await getChromium();
    const launchOptions = this.stealthEnabled 
      ? getStealthLaunchOptions() 
      : {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1920,1080',
          ],
        };
    
    const browser = await chromium.launch(launchOptions);

    const instance: BrowserInstance = {
      browser,
      contexts: new Map(),
      pageCount: 0,
      lastUsed: Date.now(),
      isClosing: false,
    };

    this.instances.push(instance);
    console.log(`[BrowserPool] Launched browser ${this.instances.length}/${this.config.max_browsers} (stealth: ${this.stealthEnabled})`);

    return browser;
  }

  async getPage(engine: SupportedEngine, options: BrowserOptions = {}): Promise<{ page: Page; sessionId: string }> {
    // For ChatGPT, try persistent profile first (has Cloudflare verification)
    if (engine === 'chatgpt') {
      try {
        const { hasVerifiedProfile, launchWithPersistentProfile, updateProfileLastUsed } = await import('./persistent-profile');
        if (hasVerifiedProfile('chatgpt')) {
          console.log('[BrowserPool] Using verified persistent profile for ChatGPT');
          const { page } = await launchWithPersistentProfile('chatgpt', { headless: false });
          updateProfileLastUsed('chatgpt');
          const sessionId = `chatgpt-persistent-${Date.now()}`;
          return { page, sessionId };
        }
      } catch (error) {
        console.warn('[BrowserPool] Persistent profile not available, using standard method:', error);
      }
    }
    
    // Get profile and fingerprint
    let profile: BrowserProfile | undefined;
    let fingerprint: BrowserFingerprint | undefined;
    let proxy: ProxyConfig | undefined;
    
    // Acquire rate limit slot
    const advancedRateLimiter = getRateLimiter();
    await advancedRateLimiter.acquire(engine, undefined, 0);
    
    try {
      // Get browser profile if enabled
      if (this.profilesEnabled) {
        const profileManager = await getProfileManager();
        profile = (await profileManager.getProfile(engine)) || undefined;
        if (profile) {
          fingerprint = profile.fingerprint;
          console.log(`[BrowserPool] Using profile: ${profile.name} (${profile.id})`);
        }
      }
      
      // Generate fingerprint if no profile
      if (!fingerprint && this.stealthEnabled) {
        fingerprint = getFingerprintGenerator().generate();
        console.log(`[BrowserPool] Generated fingerprint: ${fingerprint.id}`);
      }
      
      // Get proxy if enabled
      if (this.proxyEnabled) {
        const proxyManager = await getProxyManager();
        proxy = (await proxyManager.getProxy(engine)) || undefined;
        if (proxy) {
          console.log(`[BrowserPool] Using proxy: ${proxy.provider} (${proxy.country})`);
        }
      }
    } catch (e) {
      console.warn('[BrowserPool] Error getting profile/proxy:', e);
    }
    
    const browser = await this.getBrowser();
    const instance = this.instances.find(i => i.browser === browser)!;

    // Generate stealth context options if stealth mode is enabled
    const stealthOptions = this.stealthEnabled ? generateStealthContext() : null;
    
    // Check for existing session to restore
    const sessionStorage = getSessionStorage();
    const existingSession = await sessionStorage.getStorageStateForContext(engine).catch(() => undefined);

    // Build context options
    const contextOptions: Parameters<typeof browser.newContext>[0] = {
      viewport: fingerprint?.screen 
        ? { width: fingerprint.screen.width, height: fingerprint.screen.height }
        : options.viewport || stealthOptions?.viewport || { width: 1920, height: 1080 },
      userAgent: fingerprint?.userAgent 
        || options.user_agent_override 
        || stealthOptions?.userAgent 
        || this.getRandomUserAgent(),
      locale: fingerprint?.locale?.language || stealthOptions?.locale || 'en-US',
      timezoneId: fingerprint?.locale?.timezone || stealthOptions?.timezoneId || 'America/New_York',
      deviceScaleFactor: fingerprint?.screen?.devicePixelRatio || stealthOptions?.deviceScaleFactor || 1,
      permissions: stealthOptions?.permissions as Array<'geolocation' | 'midi' | 'midi-sysex' | 'notifications' | 'camera' | 'microphone' | 'background-sync' | 'ambient-light-sensor' | 'accelerometer' | 'gyroscope' | 'magnetometer' | 'accessibility-events' | 'clipboard-read' | 'clipboard-write' | 'payment-handler' | 'storage-access'> || [],
      extraHTTPHeaders: {
        'Accept-Language': fingerprint?.locale?.languages.join(',') || 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      // Restore session state if available
      storageState: existingSession as NonNullable<Parameters<typeof browser.newContext>[0]>['storageState'],
      // Ignore SSL errors when using proxy (proxies often use self-signed certs)
      ignoreHTTPSErrors: !!proxy,
    };
    
    // Add proxy if available
    if (proxy) {
      const proxyManager = await getProxyManager();
      contextOptions.proxy = proxyManager.getPlaywrightProxy(proxy);
      console.log(`[BrowserPool] SSL verification disabled for proxy: ${proxy.provider}`);
    }
    
    // Create context with advanced anti-detection measures
    const context = await browser.newContext(contextOptions);
    
    // Apply fingerprint script to all pages
    if (fingerprint) {
      await context.addInitScript(getFingerprintScript(fingerprint));
      console.log(`[BrowserPool] Applied fingerprint ${fingerprint.id} for ${engine}`);
    }
    
    // Apply stealth scripts and route blocking
    if (this.stealthEnabled) {
      await applyStealthToContext(context);
      console.log(`[BrowserPool] Applied stealth mode for ${engine}`);
    }
    
    // Restore profile session if available
    if (profile) {
      const profileManager = await getProfileManager();
      const restored = await profileManager.applySession(profile.id, engine, context);
      if (restored) {
        console.log(`[BrowserPool] Restored session from profile: ${profile.name}`);
      }
    }
    
    // IMPORTANT: Inject cookies from environment variables if no existing session
    if (!existingSession && hasCredentials(engine)) {
      const creds = getAuthCredentials(engine);
      if (creds?.cookies && creds.cookies.length > 0) {
        try {
          // Format cookies for Playwright
          const cookiesToAdd = creds.cookies.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path || '/',
            httpOnly: true,
            secure: true,
            sameSite: 'Lax' as const,
          }));
          
          await context.addCookies(cookiesToAdd);
          console.log(`[BrowserPool] Injected ${cookiesToAdd.length} cookies for ${engine} from environment`);
        } catch (error) {
          console.warn(`[BrowserPool] Failed to inject cookies for ${engine}:`, error);
        }
      }
    }

    // Block unnecessary resources for faster loading
    if (options.block_images || options.block_analytics) {
      await context.route('**/*', (route) => {
        const request = route.request();
        const resourceType = request.resourceType();
        const url = request.url();

        // Block images if requested
        if (options.block_images && resourceType === 'image') {
          return route.abort();
        }

        // Block analytics/tracking
        if (options.block_analytics) {
          const blockedDomains = [
            'google-analytics.com',
            'googletagmanager.com',
            'facebook.com',
            'doubleclick.net',
            'mixpanel.com',
            'segment.io',
            'amplitude.com',
          ];
          if (blockedDomains.some(d => url.includes(d))) {
            return route.abort();
          }
        }

        return route.continue();
      });
    }

    const page = await context.newPage();
    
    // Apply advanced CDP stealth immediately (before navigation)
    if (this.stealthEnabled && engine === 'chatgpt') {
      try {
        const { cdpStealthStrategy } = await import('./advanced-cloudflare-bypass');
        await cdpStealthStrategy(page, context);
        console.log(`[BrowserPool] Applied advanced CDP stealth for ${engine}`);
      } catch (error) {
        console.warn(`[BrowserPool] Failed to apply CDP stealth:`, error);
      }
    }
    
    const sessionId = `${engine}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    instance.pageCount++;
    instance.contexts.set(sessionId, context);

    this.pages.set(sessionId, {
      page,
      context,
      engine,
      sessionId,
      lastUsed: Date.now(),
      profile,
      proxy,
      fingerprint,
    });

    console.log(`[BrowserPool] Created page for ${engine}, session: ${sessionId}`);

    return { page, sessionId };
  }

  async releasePage(sessionId: string, success: boolean = true): Promise<void> {
    const pooledPage = this.pages.get(sessionId);
    if (!pooledPage) return;

    try {
      // Save profile session if available
      if (pooledPage.profile) {
        const profileManager = await getProfileManager();
        await profileManager.updateSession(pooledPage.profile.id, pooledPage.engine, pooledPage.context);
        await profileManager.markUsed(pooledPage.profile.id, pooledPage.engine);
      }
      
      // Report proxy result
      if (pooledPage.proxy) {
        const proxyManager = await getProxyManager();
        if (success) {
          proxyManager.reportSuccess(pooledPage.proxy, Date.now() - pooledPage.lastUsed);
        } else {
          proxyManager.reportFailure(pooledPage.proxy);
        }
      }
      
      // Release rate limiter slot
      const advancedRateLimiter = getRateLimiter();
      advancedRateLimiter.release(pooledPage.engine);
      if (success) {
        advancedRateLimiter.reportSuccess(pooledPage.engine);
      } else {
        advancedRateLimiter.reportError(pooledPage.engine);
      }
      
      await pooledPage.page.close();
      await pooledPage.context.close();
    } catch (error) {
      console.warn(`[BrowserPool] Error closing page ${sessionId}:`, error);
    }

    this.pages.delete(sessionId);

    // Update instance page count
    for (const instance of this.instances) {
      if (instance.contexts.has(sessionId)) {
        instance.contexts.delete(sessionId);
        instance.pageCount--;
        break;
      }
    }

    console.log(`[BrowserPool] Released page ${sessionId}`);
  }
  
  /**
   * Report a warning for the current session (e.g., captcha, rate limit)
   */
  async reportWarning(sessionId: string, warning: string): Promise<void> {
    const pooledPage = this.pages.get(sessionId);
    if (!pooledPage) return;
    
    // Report to profile manager if available
    if (pooledPage.profile) {
      const profileManager = await getProfileManager();
      await profileManager.reportWarning(pooledPage.profile.id, warning);
    }
    
    // Report to proxy manager if available
    if (pooledPage.proxy) {
      const proxyManager = await getProxyManager();
      proxyManager.reportFailure(pooledPage.proxy, warning);
    }
    
    console.warn(`[BrowserPool] Warning for ${sessionId}: ${warning}`);
  }

  private async waitForAvailableBrowser(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        const available = this.instances.find(
          i => !i.isClosing && i.pageCount < this.config.max_pages_per_browser
        );
        if (available) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();

    // Clean up idle pages
    for (const [sessionId, pooledPage] of Array.from(this.pages.entries())) {
      if (now - pooledPage.lastUsed > this.config.page_idle_timeout_ms) {
        await this.releasePage(sessionId);
      }
    }

    // Clean up idle browsers
    for (let i = this.instances.length - 1; i >= 0; i--) {
      const instance = this.instances[i];
      if (
        instance.pageCount === 0 &&
        now - instance.lastUsed > this.config.browser_idle_timeout_ms
      ) {
        instance.isClosing = true;
        try {
          await instance.browser.close();
        } catch (error) {
          console.warn('[BrowserPool] Error closing browser:', error);
        }
        this.instances.splice(i, 1);
        console.log(`[BrowserPool] Closed idle browser, ${this.instances.length} remaining`);
      }
    }
  }

  private getRandomUserAgent(): string {
    const userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all pages
    for (const sessionId of Array.from(this.pages.keys())) {
      await this.releasePage(sessionId);
    }

    // Close all browsers
    for (const instance of this.instances) {
      try {
        await instance.browser.close();
      } catch (error) {
        console.warn('[BrowserPool] Error closing browser during shutdown:', error);
      }
    }

    this.instances = [];
    console.log('[BrowserPool] Shutdown complete');
  }
}

// Global pool instance
let globalPool: BrowserPool | null = null;

export async function getBrowserPool(): Promise<BrowserPool> {
  if (!globalPool) {
    globalPool = new BrowserPool();
    await globalPool.initialize();
  }
  return globalPool;
}

export async function shutdownBrowserPool(): Promise<void> {
  if (globalPool) {
    await globalPool.shutdown();
    globalPool = null;
  }
}

// ===========================================
// Session Manager
// ===========================================

interface StoredSession {
  engine: SupportedEngine;
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>;
  localStorage: Record<string, string>;
  createdAt: string;
  lastUsedAt: string;
}

// In-memory session storage (in production, use Redis or database)
const sessionStore = new Map<string, StoredSession>();

export class SessionManager {
  private engine: SupportedEngine;

  constructor(engine: SupportedEngine) {
    this.engine = engine;
  }

  /**
   * Save session from browser context
   */
  async saveSession(context: BrowserContext, sessionId: string): Promise<void> {
    const cookies = await context.cookies();
    
    // Get localStorage from the main page
    const pages = context.pages();
    let localStorage: Record<string, string> = {};
    
    if (pages.length > 0) {
      try {
        localStorage = await pages[0].evaluate(() => {
          const items: Record<string, string> = {};
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key) {
              items[key] = window.localStorage.getItem(key) || '';
            }
          }
          return items;
        });
      } catch (error) {
        console.warn(`[SessionManager] Could not get localStorage for ${this.engine}:`, error);
      }
    }

    const session: StoredSession = {
      engine: this.engine,
      cookies: cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite as 'Strict' | 'Lax' | 'None' | undefined,
      })),
      localStorage,
      createdAt: sessionStore.get(sessionId)?.createdAt || new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    };

    sessionStore.set(sessionId, session);
    console.log(`[SessionManager] Saved session for ${this.engine}: ${cookies.length} cookies`);
  }

  /**
   * Restore session to browser context
   */
  async restoreSession(context: BrowserContext, sessionId: string): Promise<boolean> {
    const session = sessionStore.get(sessionId);
    if (!session || session.engine !== this.engine) {
      return false;
    }

    // Check if session is expired (cookies)
    const now = Date.now() / 1000;
    const validCookies = session.cookies.filter(c => !c.expires || c.expires > now);
    
    if (validCookies.length === 0) {
      sessionStore.delete(sessionId);
      return false;
    }

    // Restore cookies
    await context.addCookies(validCookies);

    // Restore localStorage
    if (Object.keys(session.localStorage).length > 0) {
      const page = await context.newPage();
      await page.goto(ENGINE_URLS[this.engine], { waitUntil: 'domcontentloaded' });
      
      await page.evaluate((items) => {
        for (const [key, value] of Object.entries(items)) {
          window.localStorage.setItem(key, value);
        }
      }, session.localStorage);
      
      await page.close();
    }

    session.lastUsedAt = new Date().toISOString();
    console.log(`[SessionManager] Restored session for ${this.engine}`);
    return true;
  }

  /**
   * Check if user is logged in
   */
  async isAuthenticated(page: Page): Promise<boolean> {
    try {
      // Engine-specific authentication checks
      switch (this.engine) {
        case 'chatgpt':
          // Check for user menu or logged-in indicators
          return await page.locator('[data-testid="profile-button"], [class*="UserMenu"]').count() > 0;
        
        case 'perplexity':
          // Check for user avatar or settings
          return await page.locator('[class*="avatar"], [class*="user-menu"]').count() > 0;
        
        case 'gemini':
          // Check for Google account indicator
          return await page.locator('[class*="gb_d"], [aria-label*="Google Account"]').count() > 0;
        
        case 'grok':
          // Check for X/Twitter login
          return await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').count() > 0;
        
        default:
          return false;
      }
    } catch (error) {
      console.warn(`[SessionManager] Auth check failed for ${this.engine}:`, error);
      return false;
    }
  }

  /**
   * Perform login (requires credentials from environment or config)
   */
  async login(page: Page, credentials: AuthCredentials): Promise<boolean> {
    if (!credentials.email || !credentials.password) {
      console.warn(`[SessionManager] No credentials provided for ${this.engine}`);
      return false;
    }

    try {
      console.log(`[SessionManager] Attempting login for ${this.engine}`);
      
      // Navigate to login page
      await page.goto(ENGINE_LOGIN_URLS[this.engine], { waitUntil: 'networkidle' });
      
      // Engine-specific login flows
      switch (this.engine) {
        case 'chatgpt':
          return await this.loginChatGPT(page, credentials);
        case 'perplexity':
          return await this.loginPerplexity(page, credentials);
        case 'gemini':
          return await this.loginGemini(page, credentials);
        case 'grok':
          return await this.loginGrok(page, credentials);
        default:
          return false;
      }
    } catch (error) {
      console.error(`[SessionManager] Login failed for ${this.engine}:`, error);
      return false;
    }
  }

  private async loginChatGPT(page: Page, credentials: AuthCredentials): Promise<boolean> {
    try {
      // Click "Log in" button if present
      await page.click('button:has-text("Log in")', { timeout: 5000 }).catch(() => {});
      
      // Enter email
      await page.fill('input[name="email"], input[type="email"]', credentials.email!);
      await page.click('button[type="submit"]:has-text("Continue")');
      
      // Wait for password field
      await page.waitForSelector('input[type="password"]', { timeout: 10000 });
      await page.fill('input[type="password"]', credentials.password!);
      await page.click('button[type="submit"]:has-text("Continue")');
      
      // Wait for redirect to chat
      await page.waitForURL('**/chat*', { timeout: 30000 });
      
      return await this.isAuthenticated(page);
    } catch (error) {
      console.error('[SessionManager] ChatGPT login error:', error);
      return false;
    }
  }

  private async loginPerplexity(page: Page, credentials: AuthCredentials): Promise<boolean> {
    try {
      // Click "Log in" if on home page
      await page.click('button:has-text("Log in"), a:has-text("Log in")', { timeout: 5000 }).catch(() => {});
      
      // Enter email
      await page.fill('input[type="email"]', credentials.email!);
      await page.click('button:has-text("Continue with email")');
      
      // Enter password (or magic link - check for password field)
      const hasPassword = await page.locator('input[type="password"]').count() > 0;
      if (hasPassword) {
        await page.fill('input[type="password"]', credentials.password!);
        await page.click('button[type="submit"]');
      }
      
      // Wait for redirect
      await page.waitForURL('**/search*', { timeout: 30000 }).catch(() => {});
      
      return await this.isAuthenticated(page);
    } catch (error) {
      console.error('[SessionManager] Perplexity login error:', error);
      return false;
    }
  }

  private async loginGemini(page: Page, credentials: AuthCredentials): Promise<boolean> {
    try {
      // Google OAuth flow
      await page.fill('input[type="email"]', credentials.email!);
      await page.click('#identifierNext, button:has-text("Next")');
      
      await page.waitForSelector('input[type="password"]', { timeout: 10000 });
      await page.fill('input[type="password"]', credentials.password!);
      await page.click('#passwordNext, button:has-text("Next")');
      
      // Wait for redirect to Gemini
      await page.waitForURL('**/gemini.google.com*', { timeout: 30000 });
      
      return await this.isAuthenticated(page);
    } catch (error) {
      console.error('[SessionManager] Gemini login error:', error);
      return false;
    }
  }

  private async loginGrok(page: Page, credentials: AuthCredentials): Promise<boolean> {
    try {
      // X/Twitter OAuth flow
      await page.fill('input[name="text"]', credentials.email!);
      await page.click('button:has-text("Next")');
      
      await page.waitForSelector('input[name="password"]', { timeout: 10000 });
      await page.fill('input[name="password"]', credentials.password!);
      await page.click('button[data-testid="LoginForm_Login_Button"]');
      
      // Wait for redirect to Grok
      await page.waitForURL('**/grok.x.ai*', { timeout: 30000 });
      
      return await this.isAuthenticated(page);
    } catch (error) {
      console.error('[SessionManager] Grok login error:', error);
      return false;
    }
  }
}

// ===========================================
// Rate Limiter
// ===========================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class RateLimiter {
  private limits: Map<SupportedEngine, RateLimitEntry> = new Map();
  private readonly maxRequestsPerMinute: Record<SupportedEngine, number> = {
    chatgpt: 10,
    perplexity: 15,
    gemini: 12,
    grok: 10,
  };

  async waitForSlot(engine: SupportedEngine): Promise<void> {
    const now = Date.now();
    const entry = this.limits.get(engine);

    if (!entry || now >= entry.resetAt) {
      this.limits.set(engine, { count: 1, resetAt: now + 60000 });
      return;
    }

    if (entry.count >= this.maxRequestsPerMinute[engine]) {
      const waitTime = entry.resetAt - now;
      console.log(`[RateLimiter] Waiting ${waitTime}ms for ${engine} rate limit`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.limits.set(engine, { count: 1, resetAt: Date.now() + 60000 });
      return;
    }

    entry.count++;
    
    // Add small random delay to appear more human
    const humanDelay = 500 + Math.random() * 1500;
    await new Promise(resolve => setTimeout(resolve, humanDelay));
  }
}

export const rateLimiter = new RateLimiter();

// ===========================================
// Exports
// ===========================================

// Note: BrowserPool and SessionManager are already exported via class declarations
export type { BrowserInstance, PooledPage, StoredSession };

// Re-export new modules for convenience
export { getProxyManager, hasProxySupport } from './proxy-manager';
export { getFingerprintGenerator, getFingerprintScript } from './fingerprint-generator';
export { getHumanBehavior, type HumanBehaviorConfig } from './human-behavior';
export { getProfileManager } from './profile-manager';
export { getRateLimiter } from './rate-limiter';

