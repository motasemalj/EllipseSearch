/**
 * Persistent Browser Profile
 * 
 * Uses a real Chrome user data directory to persist:
 * - Cookies
 * - localStorage
 * - Cloudflare verification tokens
 * - Session state
 * 
 * This allows manual verification once, then automated reuse.
 */

import type { BrowserContext, Page } from "playwright";
import * as fs from 'fs';
import * as path from 'path';
import { SupportedEngine } from '@/types';

// Directory for persistent profiles
const PROFILES_DIR = process.env.BROWSER_PROFILES_DIR || path.join(process.cwd(), '.browser-profiles');

export interface PersistentProfile {
  engine: SupportedEngine;
  userDataDir: string;
  lastUsed: Date;
  verified: boolean;
}

/**
 * Get profile directory for an engine
 */
export function getProfileDir(engine: SupportedEngine): string {
  const dir = path.join(PROFILES_DIR, engine);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Check if a profile exists and has been verified
 */
export function hasVerifiedProfile(engine: SupportedEngine): boolean {
  const profileDir = getProfileDir(engine);
  const metaFile = path.join(profileDir, 'profile-meta.json');
  
  if (!fs.existsSync(metaFile)) {
    return false;
  }
  
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
    // Consider profile valid for 24 hours
    const lastUsed = new Date(meta.lastUsed);
    const hoursSinceUse = (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60);
    return meta.verified && hoursSinceUse < 24;
  } catch {
    return false;
  }
}

/**
 * Mark profile as verified
 */
export function markProfileVerified(engine: SupportedEngine): void {
  const profileDir = getProfileDir(engine);
  const metaFile = path.join(profileDir, 'profile-meta.json');
  
  const meta: PersistentProfile = {
    engine,
    userDataDir: profileDir,
    lastUsed: new Date(),
    verified: true,
  };
  
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
}

/**
 * Update last used time
 */
export function updateProfileLastUsed(engine: SupportedEngine): void {
  const profileDir = getProfileDir(engine);
  const metaFile = path.join(profileDir, 'profile-meta.json');
  
  if (fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
    meta.lastUsed = new Date();
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
  }
}

/**
 * Launch browser with persistent profile
 */
export async function launchWithPersistentProfile(
  engine: SupportedEngine,
  options: {
    headless?: boolean;
    proxy?: { server: string; username?: string; password?: string };
  } = {}
): Promise<{ browser: BrowserContext; context: BrowserContext; page: Page }> {
  const userDataDir = getProfileDir(engine);
  // Lazy import Playwright to avoid slow worker startup when browser automation isn't used.
  const { chromium } = await import("playwright");
  
  // Note: launchPersistentContext returns a BrowserContext (not Browser)
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: options.headless ?? false, // Default to non-headless for verification
    channel: 'chrome', // Use real Chrome if available
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
      '--disable-web-security',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--start-maximized',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    proxy: options.proxy,
    ignoreHTTPSErrors: true,
  });
  
  // Get or create a page
  let page = context.pages()[0];
  if (!page) {
    page = await context.newPage();
  }
  
  // Apply stealth scripts
  await context.addInitScript(() => {
    const windowWithAutomation = window as Window & {
      chrome?: {
        runtime?: unknown;
        loadTimes?: () => void;
        csi?: () => void;
        app?: unknown;
      };
      __playwright?: unknown;
      __puppeteer?: unknown;
      __selenium?: unknown;
    };

    // Remove webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    
    // Override plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    
    // Chrome runtime
    windowWithAutomation.chrome = {
      runtime: {},
      loadTimes: function() {},
      csi: function() {},
      app: {},
    };
    
    // Remove automation indicators
    delete windowWithAutomation.__playwright;
    delete windowWithAutomation.__puppeteer;
    delete windowWithAutomation.__selenium;
  });
  
  // Return context as both browser and context for compatibility
  return { browser: context, context, page };
}

/**
 * Interactive verification flow
 * Opens browser for user to manually complete Cloudflare challenge
 */
export async function runInteractiveVerification(
  engine: SupportedEngine,
  url: string
): Promise<boolean> {
  console.log(`\n[PersistentProfile] Starting interactive verification for ${engine}`);
  console.log(`[PersistentProfile] Browser will open. Please complete any challenges manually.`);
  console.log(`[PersistentProfile] The session will be saved for future automated use.\n`);
  
  const { browser, page } = await launchWithPersistentProfile(engine, { headless: false });
  
  try {
    // Navigate to the URL
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    
    // Wait for user to complete verification (up to 2 minutes)
    console.log('[PersistentProfile] Waiting for page to be ready...');
    console.log('[PersistentProfile] Complete any challenges in the browser window.');
    
    // Wait for the main content to appear (not Cloudflare challenge)
    await page.waitForFunction(
      () => {
        const bodyText = document.body?.innerText?.toLowerCase() || '';
        // Check that Cloudflare challenge is gone
        if (
          bodyText.includes('checking your browser') ||
          bodyText.includes('just a moment') ||
          bodyText.includes('ddos protection')
        ) {
          return false;
        }
        // Check that real content is loaded
        return document.body && document.body.children.length > 5;
      },
      { timeout: 120000 }
    );
    
    console.log('[PersistentProfile] Page loaded successfully!');
    
    // Give a moment for any cookies to be set
    await page.waitForTimeout(3000);
    
    // Mark as verified
    markProfileVerified(engine);
    console.log(`[PersistentProfile] Profile verified and saved for ${engine}`);
    
    return true;
  } catch (error) {
    console.error('[PersistentProfile] Verification failed:', error);
    return false;
  } finally {
    await browser.close();
  }
}

const persistentProfile = {
  getProfileDir,
  hasVerifiedProfile,
  markProfileVerified,
  updateProfileLastUsed,
  launchWithPersistentProfile,
  runInteractiveVerification,
};

export default persistentProfile;

