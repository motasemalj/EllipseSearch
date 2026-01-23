/**
 * Authentication Flows for AI Platforms
 * 
 * Engine-specific login flows with stealth techniques.
 * Each flow handles the unique authentication requirements of its platform.
 * 
 * Supported Auth Methods:
 * - ChatGPT: Email/Password via Auth0, or session token injection
 * - Perplexity: Email magic link, Google OAuth, or session token
 * - Gemini: Google OAuth or cookie injection
 * - Grok: X/Twitter OAuth or cookie injection
 */

import type { Page, BrowserContext } from 'playwright';
import type { SupportedEngine } from '@/types';
import { humanType, humanClick, humanWait } from './stealth';
import { captureSession } from './session-storage';

// ===========================================
// Types
// ===========================================

export interface AuthCredentials {
  engine: SupportedEngine;
  
  // Email/Password auth
  email?: string;
  password?: string;
  
  // Token-based auth (injected)
  session_token?: string;
  access_token?: string;
  
  // Cookies (pre-authenticated)
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
  }>;
  
  // OAuth tokens
  oauth_token?: string;
  oauth_secret?: string;
  
  // 2FA
  totp_secret?: string;
}

export interface AuthResult {
  success: boolean;
  error?: string;
  session_saved?: boolean;
  requires_2fa?: boolean;
  requires_captcha?: boolean;
}

export interface AuthFlowOptions {
  // Timeouts
  loginTimeout?: number;
  pageLoadTimeout?: number;
  
  // Behavior
  useHumanBehavior?: boolean;
  saveSes?: boolean;
  
  // Screenshots for debugging
  captureScreenshots?: boolean;
  screenshotPath?: string;
}

// ===========================================
// Default Options
// ===========================================

const DEFAULT_AUTH_OPTIONS: AuthFlowOptions = {
  loginTimeout: 60000,
  pageLoadTimeout: 30000,
  useHumanBehavior: true,
  saveSes: true,
  captureScreenshots: false,
};

// ===========================================
// Engine URLs
// ===========================================

const AUTH_URLS = {
  chatgpt: {
    login: 'https://chatgpt.com/auth/login',
    home: 'https://chatgpt.com/',
    auth0: 'https://auth0.openai.com',
  },
  perplexity: {
    login: 'https://www.perplexity.ai/login',
    home: 'https://www.perplexity.ai/',
  },
  gemini: {
    login: 'https://gemini.google.com/',
    home: 'https://gemini.google.com/',
    accounts: 'https://accounts.google.com',
  },
  grok: {
    login: 'https://grok.x.ai/',
    home: 'https://grok.x.ai/',
    twitter: 'https://twitter.com/i/flow/login',
    x: 'https://x.com/i/flow/login',
  },
};

// ===========================================
// Base Auth Flow
// ===========================================

abstract class BaseAuthFlow {
  protected engine: SupportedEngine;
  protected options: AuthFlowOptions;
  
  constructor(engine: SupportedEngine, options: Partial<AuthFlowOptions> = {}) {
    this.engine = engine;
    this.options = { ...DEFAULT_AUTH_OPTIONS, ...options };
  }
  
  /**
   * Main authentication entry point
   */
  async authenticate(
    page: Page,
    context: BrowserContext,
    credentials: AuthCredentials
  ): Promise<AuthResult> {
    try {
      // First, try cookie injection if cookies are provided
      if (credentials.cookies && credentials.cookies.length > 0) {
        console.log(`[Auth/${this.engine}] Attempting cookie injection...`);
        const cookieResult = await this.injectCookies(page, context, credentials);
        if (cookieResult.success) {
          return cookieResult;
        }
        console.log(`[Auth/${this.engine}] Cookie injection failed, trying login...`);
      }
      
      // Then try session token injection
      if (credentials.session_token) {
        console.log(`[Auth/${this.engine}] Attempting session token injection...`);
        const tokenResult = await this.injectSessionToken(page, credentials);
        if (tokenResult.success) {
          return tokenResult;
        }
        console.log(`[Auth/${this.engine}] Token injection failed, trying login...`);
      }
      
      // Finally, do full login flow
      if (credentials.email && credentials.password) {
        console.log(`[Auth/${this.engine}] Starting login flow...`);
        return await this.loginWithCredentials(page, context, credentials);
      }
      
      return {
        success: false,
        error: 'No valid credentials provided (need email+password, session_token, or cookies)',
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Auth/${this.engine}] Authentication failed:`, errorMessage);
      
      // Take screenshot on failure if enabled
      if (this.options.captureScreenshots && this.options.screenshotPath) {
        await page.screenshot({ 
          path: `${this.options.screenshotPath}/auth-failure-${this.engine}-${Date.now()}.png`,
          fullPage: true,
        }).catch(() => {});
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
  
  /**
   * Check if currently authenticated
   */
  abstract isAuthenticated(page: Page): Promise<boolean>;
  
  /**
   * Inject cookies for pre-authenticated session
   */
  protected async injectCookies(
    page: Page,
    context: BrowserContext,
    credentials: AuthCredentials
  ): Promise<AuthResult> {
    if (!credentials.cookies) {
      return { success: false, error: 'No cookies provided' };
    }
    
    // Add cookies to context
    const cookiesToAdd = credentials.cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax' as const,
    }));
    
    await context.addCookies(cookiesToAdd);
    
    // Navigate to verify
    await page.goto(AUTH_URLS[this.engine].home, {
      waitUntil: 'domcontentloaded',
      timeout: this.options.pageLoadTimeout,
    });
    
    await humanWait(page, 2000);
    
    // Check if authenticated
    const isAuthed = await this.isAuthenticated(page);
    
    if (isAuthed && this.options.saveSes) {
      await captureSession(context, this.engine);
    }
    
    return {
      success: isAuthed,
      error: isAuthed ? undefined : 'Cookie authentication failed',
      session_saved: isAuthed && this.options.saveSes,
    };
  }
  
  /**
   * Inject session token (engine-specific)
   */
  protected abstract injectSessionToken(
    page: Page,
    credentials: AuthCredentials
  ): Promise<AuthResult>;
  
  /**
   * Full login flow with email/password
   */
  protected abstract loginWithCredentials(
    page: Page,
    context: BrowserContext,
    credentials: AuthCredentials
  ): Promise<AuthResult>;
  
  /**
   * Handle 2FA if required
   */
  protected async handle2FA(
    page: Page,
    credentials: AuthCredentials
  ): Promise<boolean> {
    // TODO: Implement TOTP handling if totp_secret is provided
    if (credentials.totp_secret) {
      // Generate TOTP code and enter it
      // This requires a TOTP library
      console.warn(`[Auth/${this.engine}] 2FA required but TOTP not implemented`);
    }
    return false;
  }
}

// ===========================================
// ChatGPT Authentication Flow
// ===========================================

class ChatGPTAuthFlow extends BaseAuthFlow {
  constructor(options: Partial<AuthFlowOptions> = {}) {
    super('chatgpt', options);
  }
  
  async isAuthenticated(page: Page): Promise<boolean> {
    const currentUrl = page.url();
    
    // Check if we're on the main chat page (not login)
    if (currentUrl.includes('/auth/login') || currentUrl.includes('auth0.openai.com')) {
      return false;
    }
    
    // Look for chat interface elements
    const hasPromptInput = await page.locator('#prompt-textarea').count() > 0;
    const hasNewChatButton = await page.locator('[data-testid="new-chat-button"], [class*="new-chat"]').count() > 0;
    
    return hasPromptInput || hasNewChatButton;
  }
  
  protected async injectSessionToken(
    page: Page,
    credentials: AuthCredentials
  ): Promise<AuthResult> {
    if (!credentials.session_token) {
      return { success: false, error: 'No session token provided' };
    }
    
    // Navigate first
    await page.goto(AUTH_URLS.chatgpt.home, {
      waitUntil: 'domcontentloaded',
      timeout: this.options.pageLoadTimeout,
    });
    
    // Set session token in localStorage and cookies
    await page.evaluate((token) => {
      // Set in localStorage
      localStorage.setItem('__Secure-next-auth.session-token', token);
      
      // Also try setting as cookie via document.cookie (limited)
      document.cookie = `__Secure-next-auth.session-token=${token}; path=/; secure; samesite=lax`;
    }, credentials.session_token);
    
    // Reload to apply
    await page.reload({ waitUntil: 'domcontentloaded' });
    await humanWait(page, 3000);
    
    return {
      success: await this.isAuthenticated(page),
      error: await this.isAuthenticated(page) ? undefined : 'Session token rejected',
    };
  }
  
  protected async loginWithCredentials(
    page: Page,
    context: BrowserContext,
    credentials: AuthCredentials
  ): Promise<AuthResult> {
    if (!credentials.email || !credentials.password) {
      return { success: false, error: 'Email and password required' };
    }
    
    // Navigate to login page
    await page.goto(AUTH_URLS.chatgpt.login, {
      waitUntil: 'networkidle',
      timeout: this.options.pageLoadTimeout,
    });
    
    await humanWait(page, 2000);
    
    // Click "Log in" button
    const loginButton = page.locator('button:has-text("Log in"), [data-testid="login-button"]');
    if (await loginButton.count() > 0) {
      await humanClick(page, 'button:has-text("Log in"), [data-testid="login-button"]');
      await humanWait(page, 2000);
    }
    
    // Wait for Auth0 email input
    await page.waitForSelector('input[name="email"], input[type="email"]', {
      timeout: this.options.loginTimeout! / 2,
    });
    
    // Enter email
    if (this.options.useHumanBehavior) {
      await humanType(page, 'input[name="email"], input[type="email"]', credentials.email);
    } else {
      await page.fill('input[name="email"], input[type="email"]', credentials.email);
    }
    
    await humanWait(page, 500);
    
    // Click Continue
    await humanClick(page, 'button[type="submit"], button:has-text("Continue")');
    await humanWait(page, 2000);
    
    // Wait for password input
    await page.waitForSelector('input[name="password"], input[type="password"]', {
      timeout: this.options.loginTimeout! / 2,
    });
    
    // Enter password
    if (this.options.useHumanBehavior) {
      await humanType(page, 'input[name="password"], input[type="password"]', credentials.password);
    } else {
      await page.fill('input[name="password"], input[type="password"]', credentials.password);
    }
    
    await humanWait(page, 500);
    
    // Click Continue/Log in
    await humanClick(page, 'button[type="submit"], button:has-text("Continue"), button:has-text("Log in")');
    
    // Wait for redirect to chat
    try {
      await page.waitForURL('**/chat.openai.com/**', {
        timeout: this.options.loginTimeout,
      });
      
      await humanWait(page, 3000);
      
      const isAuthed = await this.isAuthenticated(page);
      
      if (isAuthed && this.options.saveSes) {
        await captureSession(context, 'chatgpt');
      }
      
      return {
        success: isAuthed,
        session_saved: isAuthed && this.options.saveSes,
      };
      
    } catch {
      // Check for 2FA or captcha
      const has2FA = await page.locator('input[name="code"], input[name="otp"]').count() > 0;
      const hasCaptcha = await page.locator('[class*="captcha"], [class*="recaptcha"]').count() > 0;
      
      if (has2FA) {
        return { success: false, requires_2fa: true };
      }
      if (hasCaptcha) {
        return { success: false, requires_captcha: true };
      }
      
      return { success: false, error: 'Login timed out or failed' };
    }
  }
}

// ===========================================
// Perplexity Authentication Flow
// ===========================================

class PerplexityAuthFlow extends BaseAuthFlow {
  constructor(options: Partial<AuthFlowOptions> = {}) {
    super('perplexity', options);
  }
  
  async isAuthenticated(page: Page): Promise<boolean> {
    // Check for user menu or settings (indicates logged in)
    const hasUserMenu = await page.locator('[class*="user-menu"], [class*="account"], [class*="avatar"]').count() > 0;
    const hasSettingsButton = await page.locator('button:has-text("Settings"), [class*="settings"]').count() > 0;
    
    // Check we're not on login page
    const isLoginPage = page.url().includes('/login') || page.url().includes('/signin');
    
    return (hasUserMenu || hasSettingsButton) && !isLoginPage;
  }
  
  protected async injectSessionToken(
    page: Page,
    credentials: AuthCredentials
  ): Promise<AuthResult> {
    void page;
    void credentials;
    // Perplexity uses a visitor ID and auth tokens
    if (!credentials.session_token) {
      return { success: false, error: 'No session token provided' };
    }
    
    await page.goto(AUTH_URLS.perplexity.home, {
      waitUntil: 'domcontentloaded',
    });
    
    await page.evaluate((token) => {
      localStorage.setItem('pplx.session', token);
    }, credentials.session_token);
    
    await page.reload();
    await humanWait(page, 2000);
    
    return {
      success: await this.isAuthenticated(page),
    };
  }
  
  protected async loginWithCredentials(
    page: Page,
    context: BrowserContext,
    credentials: AuthCredentials
  ): Promise<AuthResult> {
    // Perplexity typically uses magic links or OAuth
    // Direct email/password login may not be available
    
    await page.goto(AUTH_URLS.perplexity.login, {
      waitUntil: 'networkidle',
    });
    
    await humanWait(page, 2000);
    
    // Look for Google sign-in as fallback
    const googleButton = page.locator('button:has-text("Google"), [class*="google"]');
    
    if (await googleButton.count() > 0) {
      return {
        success: false,
        error: 'Perplexity requires OAuth login. Please provide cookies or use Google OAuth.',
      };
    }
    
    // Try email login if available
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.count() > 0 && credentials.email) {
      await humanType(page, 'input[type="email"]', credentials.email);
      await humanClick(page, 'button[type="submit"]');
      
      // Wait for magic link message
      await humanWait(page, 3000);
      
      return {
        success: false,
        error: 'Perplexity sent a magic link to your email. Please use cookie injection instead.',
      };
    }
    
    return {
      success: false,
      error: 'Could not find login form',
    };
  }
}

// ===========================================
// Gemini Authentication Flow
// ===========================================

class GeminiAuthFlow extends BaseAuthFlow {
  constructor(options: Partial<AuthFlowOptions> = {}) {
    super('gemini', options);
  }
  
  async isAuthenticated(page: Page): Promise<boolean> {
    // Check for Gemini chat interface
    const hasChatInput = await page.locator('rich-textarea, textarea[aria-label*="message"]').count() > 0;
    const hasAccountMenu = await page.locator('[class*="account"], [aria-label*="account"]').count() > 0;
    
    // Check we're not redirected to accounts.google.com
    const isLoginPage = page.url().includes('accounts.google.com');
    
    return (hasChatInput || hasAccountMenu) && !isLoginPage;
  }
  
  protected async injectSessionToken(
    page: Page,
    credentials: AuthCredentials
  ): Promise<AuthResult> {
    void page;
    void credentials;
    // Gemini uses Google auth cookies
    return { success: false, error: 'Use cookie injection for Gemini (Google cookies required)' };
  }
  
  protected async loginWithCredentials(
    page: Page,
    context: BrowserContext,
    credentials: AuthCredentials
  ): Promise<AuthResult> {
    if (!credentials.email || !credentials.password) {
      return { success: false, error: 'Google email and password required' };
    }
    
    await page.goto(AUTH_URLS.gemini.home, {
      waitUntil: 'networkidle',
    });
    
    await humanWait(page, 2000);
    
    // Check if redirected to Google login
    if (!page.url().includes('accounts.google.com')) {
      // Look for sign-in button
      const signInButton = page.locator('a:has-text("Sign in"), button:has-text("Sign in")');
      if (await signInButton.count() > 0) {
        await humanClick(page, 'a:has-text("Sign in"), button:has-text("Sign in")');
        await humanWait(page, 2000);
      }
    }
    
    // Wait for Google login page
    try {
      await page.waitForURL('**/accounts.google.com/**', { timeout: 10000 });
    } catch {
      // Already on login or authenticated
      if (await this.isAuthenticated(page)) {
        return { success: true };
      }
    }
    
    // Enter email
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    if (this.options.useHumanBehavior) {
      await humanType(page, 'input[type="email"]', credentials.email);
    } else {
      await page.fill('input[type="email"]', credentials.email);
    }
    
    await humanClick(page, 'button:has-text("Next"), #identifierNext');
    await humanWait(page, 3000);
    
    // Enter password
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    if (this.options.useHumanBehavior) {
      await humanType(page, 'input[type="password"]', credentials.password);
    } else {
      await page.fill('input[type="password"]', credentials.password);
    }
    
    await humanClick(page, 'button:has-text("Next"), #passwordNext');
    
    // Wait for redirect back to Gemini
    try {
      await page.waitForURL('**/gemini.google.com/**', {
        timeout: this.options.loginTimeout,
      });
      
      await humanWait(page, 3000);
      
      const isAuthed = await this.isAuthenticated(page);
      
      if (isAuthed && this.options.saveSes) {
        await captureSession(context, 'gemini');
      }
      
      return {
        success: isAuthed,
        session_saved: isAuthed && this.options.saveSes,
      };
      
    } catch {
      // Check for 2FA
      const has2FA = await page.locator('input[name="totpPin"], [class*="2fa"]').count() > 0;
      
      if (has2FA) {
        return { success: false, requires_2fa: true, error: 'Google 2FA required' };
      }
      
      return { success: false, error: 'Google login failed or timed out' };
    }
  }
}

// ===========================================
// Grok Authentication Flow
// ===========================================

class GrokAuthFlow extends BaseAuthFlow {
  constructor(options: Partial<AuthFlowOptions> = {}) {
    super('grok', options);
  }
  
  async isAuthenticated(page: Page): Promise<boolean> {
    // Check for Grok chat interface
    const hasChatInput = await page.locator('textarea[placeholder*="message"], textarea[placeholder*="Ask"]').count() > 0;
    const hasUserMenu = await page.locator('[class*="user"], [class*="account"], [class*="avatar"]').count() > 0;
    
    // Check we're not on login page
    const isLoginPage = page.url().includes('x.com/i/flow/login') || 
                        page.url().includes('twitter.com/i/flow/login');
    
    return (hasChatInput || hasUserMenu) && !isLoginPage;
  }
  
  protected async injectSessionToken(
    page: Page,
    credentials: AuthCredentials
  ): Promise<AuthResult> {
    // Grok uses X/Twitter auth
    if (!credentials.session_token && !credentials.cookies) {
      return { success: false, error: 'X/Twitter cookies required for Grok' };
    }
    
    return { success: false, error: 'Use cookie injection for Grok (auth_token and ct0 cookies required)' };
  }
  
  protected async loginWithCredentials(
    page: Page,
    context: BrowserContext,
    credentials: AuthCredentials
  ): Promise<AuthResult> {
    if (!credentials.email || !credentials.password) {
      return { success: false, error: 'X/Twitter email/username and password required' };
    }
    
    // Go to X login
    await page.goto(AUTH_URLS.grok.x, {
      waitUntil: 'networkidle',
    });
    
    await humanWait(page, 2000);
    
    // Enter username/email
    await page.waitForSelector('input[autocomplete="username"], input[name="text"]', { timeout: 10000 });
    if (this.options.useHumanBehavior) {
      await humanType(page, 'input[autocomplete="username"], input[name="text"]', credentials.email);
    } else {
      await page.fill('input[autocomplete="username"], input[name="text"]', credentials.email);
    }
    
    // Click Next
    await humanClick(page, 'div[role="button"]:has-text("Next"), button:has-text("Next")');
    await humanWait(page, 2000);
    
    // May need to verify identity with phone/email
    const verificationInput = page.locator('input[data-testid="ocfEnterTextTextInput"]');
    if (await verificationInput.count() > 0) {
      return { success: false, error: 'X requires additional verification. Please use cookie injection.' };
    }
    
    // Enter password
    await page.waitForSelector('input[name="password"], input[type="password"]', { timeout: 10000 });
    if (this.options.useHumanBehavior) {
      await humanType(page, 'input[name="password"], input[type="password"]', credentials.password);
    } else {
      await page.fill('input[name="password"], input[type="password"]', credentials.password);
    }
    
    // Click Log in
    await humanClick(page, 'div[role="button"]:has-text("Log in"), button:has-text("Log in")');
    
    // Wait for redirect to home or Grok
    try {
      await page.waitForURL('**/x.com/home', { timeout: 30000 });
      
      // Now navigate to Grok
      await page.goto(AUTH_URLS.grok.home, { waitUntil: 'networkidle' });
      await humanWait(page, 3000);
      
      const isAuthed = await this.isAuthenticated(page);
      
      if (isAuthed && this.options.saveSes) {
        await captureSession(context, 'grok');
      }
      
      return {
        success: isAuthed,
        session_saved: isAuthed && this.options.saveSes,
      };
      
    } catch {
      const has2FA = await page.locator('input[name="code"]').count() > 0;
      
      if (has2FA) {
        return { success: false, requires_2fa: true, error: 'X 2FA required' };
      }
      
      return { success: false, error: 'X login failed or timed out' };
    }
  }
}

// ===========================================
// Factory Function
// ===========================================

export function getAuthFlow(
  engine: SupportedEngine,
  options?: Partial<AuthFlowOptions>
): BaseAuthFlow {
  switch (engine) {
    case 'chatgpt':
      return new ChatGPTAuthFlow(options);
    case 'perplexity':
      return new PerplexityAuthFlow(options);
    case 'gemini':
      return new GeminiAuthFlow(options);
    case 'grok':
      return new GrokAuthFlow(options);
    default:
      throw new Error(`Unknown engine: ${engine}`);
  }
}

// ===========================================
// Convenience Function
// ===========================================

/**
 * Authenticate with an AI platform
 */
export async function authenticateEngine(
  page: Page,
  context: BrowserContext,
  engine: SupportedEngine,
  credentials: AuthCredentials,
  options?: Partial<AuthFlowOptions>
): Promise<AuthResult> {
  const authFlow = getAuthFlow(engine, options);
  return authFlow.authenticate(page, context, credentials);
}

/**
 * Check if currently authenticated
 */
export async function isEngineAuthenticated(
  page: Page,
  engine: SupportedEngine
): Promise<boolean> {
  const authFlow = getAuthFlow(engine);
  return authFlow.isAuthenticated(page);
}

const authFlows = {
  getAuthFlow,
  authenticateEngine,
  isEngineAuthenticated,
};

export default authFlows;

