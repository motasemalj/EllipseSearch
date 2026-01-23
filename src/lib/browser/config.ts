/**
 * Browser Automation Configuration
 * 
 * Environment variables and settings for browser-based simulations.
 */

import type { SupportedEngine } from '@/types';
import type { BrowserPoolConfig, AuthCredentials } from './types';

// ===========================================
// Environment Variables
// ===========================================

/**
 * Browser automation mode
 * - 'enabled': Browser automation is fully enabled
 * - 'disabled': Only API mode available
 * - 'pro_only': Browser mode only for Pro/Agency tiers
 */
export const BROWSER_MODE = process.env.BROWSER_AUTOMATION_MODE || 'pro_only';

/**
 * Headless mode - set to 'false' for debugging
 */
export const BROWSER_HEADLESS = process.env.BROWSER_HEADLESS !== 'false';

/**
 * Default timeout for browser operations (ms)
 */
export const BROWSER_TIMEOUT = parseInt(process.env.BROWSER_TIMEOUT || '120000');

/**
 * Screenshot directory for debugging
 */
export const SCREENSHOT_DIR = process.env.BROWSER_SCREENSHOT_DIR || '/tmp/browser-screenshots';

// ===========================================
// Stealth Mode Configuration
// ===========================================

/**
 * Enable stealth mode to avoid bot detection
 * This includes: webdriver masking, fingerprint randomization, human-like behavior
 */
export const STEALTH_MODE_ENABLED = process.env.BROWSER_STEALTH_MODE !== 'false';

/**
 * Enable human-like behavior simulation
 * This includes: random typing delays, mouse movements, scroll patterns
 */
export const HUMAN_BEHAVIOR_ENABLED = process.env.BROWSER_HUMAN_BEHAVIOR !== 'false';

/**
 * Session encryption key (for encrypting stored sessions)
 * Should be a strong random string in production
 */
export const SESSION_ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY;

// ===========================================
// Authentication Credentials
// ===========================================

/**
 * Parse cookies from JSON string or individual cookie values
 */
function parseCookies(cookieEnv: string | undefined): Array<{
  name: string;
  value: string;
  domain: string;
  path?: string;
}> | undefined {
  if (!cookieEnv) return undefined;
  
  try {
    // Try parsing as JSON array
    return JSON.parse(cookieEnv);
  } catch {
    // Not JSON, might be a single cookie value
    return undefined;
  }
}

/**
 * Get authentication credentials for an engine
 * Supports multiple auth methods:
 * - Email/Password: For full login flow
 * - Session Token: For token injection
 * - Cookies: For pre-authenticated session restore
 * 
 * Environment variables:
 * - [ENGINE]_EMAIL, [ENGINE]_PASSWORD: Login credentials
 * - [ENGINE]_SESSION_TOKEN: Session token for injection
 * - [ENGINE]_COOKIES: JSON array of cookies for session restore
 */
export function getAuthCredentials(engine: SupportedEngine): AuthCredentials | null {
  switch (engine) {
    case 'chatgpt':
      return {
        engine: 'chatgpt',
        email: process.env.CHATGPT_EMAIL,
        password: process.env.CHATGPT_PASSWORD,
        session_token: process.env.CHATGPT_SESSION_TOKEN,
        cookies: parseCookies(process.env.CHATGPT_COOKIES),
      };
    
    case 'perplexity':
      return {
        engine: 'perplexity',
        email: process.env.PERPLEXITY_EMAIL,
        password: process.env.PERPLEXITY_PASSWORD,
        session_token: process.env.PERPLEXITY_SESSION_TOKEN,
        cookies: parseCookies(process.env.PERPLEXITY_COOKIES),
      };
    
    case 'gemini':
      return {
        engine: 'gemini',
        email: process.env.GOOGLE_EMAIL || process.env.GEMINI_EMAIL,
        password: process.env.GOOGLE_PASSWORD || process.env.GEMINI_PASSWORD,
        session_token: process.env.GOOGLE_SESSION_TOKEN || process.env.GEMINI_SESSION_TOKEN,
        cookies: parseCookies(process.env.GOOGLE_COOKIES || process.env.GEMINI_COOKIES),
      };
    
    case 'grok':
      return {
        engine: 'grok',
        email: process.env.X_EMAIL || process.env.TWITTER_EMAIL || process.env.GROK_EMAIL,
        password: process.env.X_PASSWORD || process.env.TWITTER_PASSWORD || process.env.GROK_PASSWORD,
        session_token: process.env.X_SESSION_TOKEN || process.env.TWITTER_SESSION_TOKEN,
        cookies: parseCookies(process.env.X_COOKIES || process.env.TWITTER_COOKIES || process.env.GROK_COOKIES),
      };
    
    default:
      return null;
  }
}

/**
 * Check if credentials are available for an engine
 */
export function hasCredentials(engine: SupportedEngine): boolean {
  const creds = getAuthCredentials(engine);
  if (!creds) return false;
  
  // Check for any valid auth method
  return !!(creds.email && creds.password) || 
         !!creds.session_token || 
         !!(creds.cookies && creds.cookies.length > 0);
}

/**
 * Get the best available auth method for an engine
 */
export function getAuthMethod(engine: SupportedEngine): 'cookies' | 'session_token' | 'login' | 'none' {
  const creds = getAuthCredentials(engine);
  if (!creds) return 'none';
  
  // Prefer cookies (fastest, no interaction needed)
  if (creds.cookies && creds.cookies.length > 0) return 'cookies';
  
  // Then session token (fast injection)
  if (creds.session_token) return 'session_token';
  
  // Finally email/password login
  if (creds.email && creds.password) return 'login';
  
  return 'none';
}

// ===========================================
// Browser Pool Configuration
// ===========================================

export const BROWSER_POOL_CONFIG: BrowserPoolConfig = {
  max_browsers: parseInt(process.env.BROWSER_POOL_MAX_BROWSERS || '5'),
  max_pages_per_browser: parseInt(process.env.BROWSER_POOL_MAX_PAGES || '3'),
  browser_idle_timeout_ms: parseInt(process.env.BROWSER_IDLE_TIMEOUT || '300000'),
  page_idle_timeout_ms: parseInt(process.env.PAGE_IDLE_TIMEOUT || '60000'),
};

// ===========================================
// Rate Limiting
// ===========================================

export const RATE_LIMITS: Record<SupportedEngine, {
  requestsPerMinute: number;
  minDelayMs: number;
  maxDelayMs: number;
}> = {
  chatgpt: {
    requestsPerMinute: parseInt(process.env.CHATGPT_RATE_LIMIT || '10'),
    minDelayMs: 2000,
    maxDelayMs: 5000,
  },
  perplexity: {
    requestsPerMinute: parseInt(process.env.PERPLEXITY_RATE_LIMIT || '15'),
    minDelayMs: 1500,
    maxDelayMs: 4000,
  },
  gemini: {
    requestsPerMinute: parseInt(process.env.GEMINI_RATE_LIMIT || '12'),
    minDelayMs: 2000,
    maxDelayMs: 4500,
  },
  grok: {
    requestsPerMinute: parseInt(process.env.GROK_RATE_LIMIT || '10'),
    minDelayMs: 2000,
    maxDelayMs: 5000,
  },
};

// ===========================================
// Feature Flags
// ===========================================

export const FEATURES = {
  /** Enable screenshot capture for debugging */
  captureScreenshots: process.env.BROWSER_CAPTURE_SCREENSHOTS === 'true',
  
  /** Block images for faster page loads */
  blockImages: process.env.BROWSER_BLOCK_IMAGES !== 'false',
  
  /** Block analytics/tracking scripts */
  blockAnalytics: process.env.BROWSER_BLOCK_ANALYTICS !== 'false',
  
  /** Enable session persistence (cookies, localStorage) */
  persistSessions: process.env.BROWSER_PERSIST_SESSIONS === 'true',
  
  /** Enable hybrid mode (API + Browser) */
  enableHybridMode: process.env.BROWSER_ENABLE_HYBRID !== 'false',
  
  /** Log DOM snapshots for debugging */
  logDOMSnapshots: process.env.BROWSER_LOG_DOM === 'true',
};

// ===========================================
// Proxy Configuration
// ===========================================

export interface ProxyRotationConfig {
  enabled: boolean;
  proxies: Array<{
    server: string;
    username?: string;
    password?: string;
    region?: string;
  }>;
}

export function getProxyConfig(): ProxyRotationConfig {
  const proxyList = process.env.BROWSER_PROXY_LIST;
  
  if (!proxyList) {
    return { enabled: false, proxies: [] };
  }
  
  try {
    const proxies = JSON.parse(proxyList);
    return { enabled: true, proxies };
  } catch {
    // Parse simple format: server1,server2,server3
    const servers = proxyList.split(',').map(s => s.trim()).filter(Boolean);
    return {
      enabled: servers.length > 0,
      proxies: servers.map(server => ({ server })),
    };
  }
}

// ===========================================
// Logging
// ===========================================

export const LOG_LEVEL = process.env.BROWSER_LOG_LEVEL || 'info';

export function log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const currentLevel = levels[LOG_LEVEL as keyof typeof levels] ?? 1;
  
  if (levels[level] >= currentLevel) {
    const prefix = `[Browser:${level.toUpperCase()}]`;
    switch (level) {
      case 'debug':
        console.debug(prefix, message, ...args);
        break;
      case 'info':
        console.log(prefix, message, ...args);
        break;
      case 'warn':
        console.warn(prefix, message, ...args);
        break;
      case 'error':
        console.error(prefix, message, ...args);
        break;
    }
  }
}

