/**
 * Base Browser Engine
 * 
 * Abstract base class for AI engine browser automation.
 * Each engine (ChatGPT, Perplexity, Gemini, Grok) extends this class
 * with engine-specific DOM interactions.
 * 
 * Features:
 * - Stealth mode with anti-detection measures
 * - Human-like behavior simulation
 * - Automatic session restoration
 * - Authentication flow handling
 */

import type { Page, BrowserContext } from 'playwright';
import type {
  SupportedEngine,
  SupportedLanguage,
  SupportedRegion,
  BrowserCaptureResult,
  BrowserOptions,
  ENGINE_SELECTORS,
} from '../types';
import { 
  getBrowserPool, 
  rateLimiter, 
  SessionManager, 
  ENGINE_URLS 
} from '../browser-manager';
import { 
  createDOMParser, 
  waitForStreamingComplete, 
  typeWithHumanDelay 
} from '../dom-parser';
import { getRegionInfo } from '@/types';
import {
  humanType,
  humanClick,
  humanWait,
  humanScroll,
  applyStealthToPage,
} from '../stealth';
import {
  getSessionStorage,
  captureSession,
} from '../session-storage';
import {
  getAuthFlow,
  isEngineAuthenticated,
  type AuthCredentials as BrowserAuthCredentials,
} from '../auth-flows';

export interface EngineSimulationInput {
  prompt: string;
  language: SupportedLanguage;
  region: SupportedRegion;
  brand_domain: string;
  options?: BrowserOptions;
  
  // Authentication
  auth_credentials?: BrowserAuthCredentials;
  
  // Behavior options
  use_stealth?: boolean;
  use_human_behavior?: boolean;
  save_session?: boolean;
}

export abstract class BaseBrowserEngine {
  protected engine: SupportedEngine;
  protected selectors: typeof ENGINE_SELECTORS[SupportedEngine];
  protected sessionManager: SessionManager;

  constructor(
    engine: SupportedEngine,
    selectors: typeof ENGINE_SELECTORS[SupportedEngine]
  ) {
    this.engine = engine;
    this.selectors = selectors;
    this.sessionManager = new SessionManager(engine);
  }

  /**
   * Run a full browser simulation with stealth and human-like behavior
   */
  async runSimulation(input: EngineSimulationInput): Promise<BrowserCaptureResult> {
    const startTime = Date.now();
    const pool = await getBrowserPool();
    
    // Configuration
    const useStealth = input.use_stealth !== false; // Default true
    const useHumanBehavior = input.use_human_behavior !== false; // Default true
    const saveSession = input.save_session !== false; // Default true
    
    // Wait for rate limit slot
    await rateLimiter.waitForSlot(this.engine);
    
    const { page, sessionId } = await pool.getPage(this.engine, input.options);
    const context = page.context();
    
    try {
      // Apply additional stealth measures to the page
      if (useStealth) {
        await applyStealthToPage(page);
        console.log(`[${this.engine}] Stealth mode applied`);
      }
      
      // Navigate to engine (with page closure check)
      if (page.isClosed()) {
        throw new Error(`Page was closed before navigation for ${this.engine}`);
      }
      
      const pageLoadStart = Date.now();
      await this.navigateToEngine(page, input);
      const pageLoadTime = Date.now() - pageLoadStart;
      
      // Check if page closed during navigation
      if (page.isClosed()) {
        throw new Error(`Page was closed during navigation for ${this.engine}`);
      }
      
      // Human-like initial page interaction
      if (useHumanBehavior) {
        await humanWait(page, 1000, 0.3);
        await humanScroll(page, 'down', 100);
        await humanWait(page, 500);
      }

      // Check and handle authentication
      const needsAuth = input.options?.use_auth || input.auth_credentials;
      let isAuthenticated = false;
      
      if (needsAuth) {
        isAuthenticated = await this.handleAuthenticationAdvanced(page, context, input);
        
        if (!isAuthenticated) {
          console.warn(`[${this.engine}] Authentication required but failed - attempting unauthenticated access`);
        }
      } else {
        // Check if we're authenticated from restored session
        isAuthenticated = await isEngineAuthenticated(page, this.engine).catch(() => false);
      }

      // Wait for page to be ready
      await this.waitForPageReady(page);

      // Send the prompt with human-like typing
      await this.sendPromptHumanLike(page, input.prompt, input.language, useHumanBehavior);

      // Wait for response to complete
      await this.waitForResponse(page, input.options?.timeout_ms || 60000);

      // Parse the DOM to extract structured data
      const parser = createDOMParser(page, this.engine, this.selectors);
      const extracted = await parser.extractAll();

      // Take screenshot if requested
      if (input.options?.capture_screenshots && input.options.screenshot_path) {
        await page.screenshot({ 
          path: input.options.screenshot_path,
          fullPage: true,
        });
      }
      
      // Save session state for future use
      if (saveSession && isAuthenticated) {
        try {
          await captureSession(context, this.engine);
          console.log(`[${this.engine}] Session saved for future use`);
        } catch (e) {
          console.warn(`[${this.engine}] Failed to save session:`, e);
        }
      }

      const responseTime = Date.now() - startTime;

      // Build result
      const result: BrowserCaptureResult = {
        engine: this.engine,
        mode: 'browser',
        answer_html: extracted.answer_html,
        answer_text: extracted.answer_text,
        answer_markdown: extracted.answer_markdown,
        citations: extracted.citations,
        search_chips: extracted.search_chips,
        product_tiles: extracted.product_tiles,
        source_cards: extracted.source_cards,
        knowledge_panel: extracted.knowledge_panel,
        suggested_followups: extracted.suggested_followups,
        dom_snapshot: extracted.dom_snapshot,
        response_time_ms: responseTime,
        page_load_time_ms: pageLoadTime,
        capture_timestamp: new Date().toISOString(),
        session_id: sessionId,
        was_logged_in: isAuthenticated,
        user_agent: await page.evaluate(() => navigator.userAgent),
        viewport: input.options?.viewport || { width: 1920, height: 1080 },
      };

      console.log(`[${this.engine}] Simulation complete: ${extracted.citations.length} citations, ${extracted.source_cards.length} sources (authenticated: ${isAuthenticated})`);

      return result;

    } catch (error) {
      console.error(`[${this.engine}] Simulation error:`, error);
      throw error;
    } finally {
      await pool.releasePage(sessionId);
    }
  }

  /**
   * Navigate to the engine's URL with region handling
   */
  protected async navigateToEngine(page: Page, input: EngineSimulationInput): Promise<void> {
    const baseUrl = ENGINE_URLS[this.engine];
    const url = this.getUrlWithRegion(baseUrl, input.region);
    
    console.log(`[${this.engine}] Navigating to: ${url}`);
    
    // For ChatGPT, use load state instead of networkidle (more reliable with proxies)
    const waitUntil = this.engine === 'chatgpt' ? 'load' : 'domcontentloaded';
    
    try {
      await page.goto(url, { 
        waitUntil,
        timeout: 90000, // Increased timeout for proxy + Cloudflare challenges
      });
    } catch (error) {
      // If navigation fails, try to handle Cloudflare challenge
      if (this.engine === 'chatgpt' && !page.isClosed()) {
        const { hasCloudflareChallenge, bypassCloudflare } = await import('../advanced-cloudflare-bypass');
        const isChallenge = await hasCloudflareChallenge(page);
        if (isChallenge) {
          console.log('[ChatGPT] Cloudflare challenge detected during navigation, attempting bypass...');
          const context = page.context();
          await bypassCloudflare(page, context);
        }
      }
      // Don't throw - let it continue
    }
    
    // Handle Cloudflare challenge after navigation (for ChatGPT)
    if (this.engine === 'chatgpt' && !page.isClosed()) {
      const { hasCloudflareChallenge, bypassCloudflare } = await import('../advanced-cloudflare-bypass');
      const isChallenge = await hasCloudflareChallenge(page);
      if (isChallenge) {
        console.log('[ChatGPT] Cloudflare challenge detected after navigation, attempting advanced bypass...');
        const context = page.context();
        const bypassed = await bypassCloudflare(page, context);
        if (!bypassed) {
          console.warn('[ChatGPT] Cloudflare bypass failed, but continuing...');
        } else {
          console.log('[ChatGPT] Cloudflare bypass successful');
        }
      }
    }
    
    // Additional wait for React/SPA to hydrate
    if (this.engine === 'chatgpt') {
      await page.waitForTimeout(3000); // Longer wait for full hydration
    }
  }

  /**
   * Get URL with region-specific parameters
   */
  protected getUrlWithRegion(baseUrl: string, region: SupportedRegion): string {
    // Default implementation - override in specific engines
    return baseUrl;
  }

  /**
   * Handle authentication if needed (legacy)
   */
  protected async handleAuthentication(page: Page, options: BrowserOptions): Promise<void> {
    const isAuthed = await this.sessionManager.isAuthenticated(page);
    
    if (!isAuthed && options.auth_credentials) {
      console.log(`[${this.engine}] Not authenticated, attempting login...`);
      await this.sessionManager.login(page, options.auth_credentials);
    }
  }
  
  /**
   * Advanced authentication handling with auth flows
   */
  protected async handleAuthenticationAdvanced(
    page: Page,
    context: BrowserContext,
    input: EngineSimulationInput
  ): Promise<boolean> {
    // First check if already authenticated (from session restore)
    const alreadyAuth = await isEngineAuthenticated(page, this.engine).catch(() => false);
    if (alreadyAuth) {
      console.log(`[${this.engine}] Already authenticated from restored session`);
      return true;
    }
    
    // Try to authenticate with provided credentials
    if (input.auth_credentials) {
      console.log(`[${this.engine}] Attempting authentication with provided credentials...`);
      
      const authFlow = getAuthFlow(this.engine);
      const result = await authFlow.authenticate(page, context, input.auth_credentials);
      
      if (result.success) {
        console.log(`[${this.engine}] Authentication successful`);
        return true;
      }
      
      if (result.requires_2fa) {
        console.warn(`[${this.engine}] 2FA required - cannot complete authentication`);
        return false;
      }
      
      if (result.requires_captcha) {
        console.warn(`[${this.engine}] CAPTCHA required - cannot complete authentication`);
        return false;
      }
      
      console.warn(`[${this.engine}] Authentication failed: ${result.error}`);
      return false;
    }
    
    // Fall back to legacy authentication
    if (input.options?.use_auth && input.options?.auth_credentials) {
      await this.handleAuthentication(page, input.options);
      return await isEngineAuthenticated(page, this.engine).catch(() => false);
    }
    
    return false;
  }

  /**
   * Wait for page to be fully ready for input
   */
  protected async waitForPageReady(page: Page): Promise<void> {
    // Wait for prompt input to be visible
    await page.waitForSelector(this.selectors.prompt_input, { 
      state: 'visible',
      timeout: 15000,
    });
    
    // Additional engine-specific checks can be overridden
    await page.waitForTimeout(500);
  }

  /**
   * Send a prompt to the AI engine (legacy method)
   */
  protected async sendPrompt(
    page: Page, 
    prompt: string, 
    language: SupportedLanguage
  ): Promise<void> {
    await this.sendPromptHumanLike(page, prompt, language, false);
  }
  
  /**
   * Send a prompt with human-like behavior
   */
  protected async sendPromptHumanLike(
    page: Page,
    prompt: string,
    language: SupportedLanguage,
    useHumanBehavior: boolean
  ): Promise<void> {
    // Prepare prompt with language instruction if needed
    const fullPrompt = language === 'ar' 
      ? `${prompt}\n\n(Please respond in Arabic)`
      : prompt;

    console.log(`[${this.engine}] Sending prompt: "${fullPrompt.slice(0, 100)}..."`);

    // Find and focus input
    const inputSelector = this.selectors.prompt_input;
    
    if (useHumanBehavior) {
      // Human-like: click with mouse movement
      await humanClick(page, inputSelector);
      await humanWait(page, 300);
      
      // Type with natural rhythm
      await humanType(page, inputSelector, fullPrompt);
      
      // Pause like reading/reviewing before sending
      await humanWait(page, 500, 0.5);
    } else {
      // Standard: direct input
      const input = page.locator(inputSelector);
      await input.click();
      await input.waitFor({ state: 'visible' });
      await typeWithHumanDelay(input, fullPrompt);
      await page.waitForTimeout(200 + Math.random() * 300);
    }

    // Submit
    await this.submitPromptHumanLike(page, useHumanBehavior);
  }
  
  /**
   * Submit the prompt with optional human-like behavior
   */
  protected async submitPromptHumanLike(page: Page, useHumanBehavior: boolean): Promise<void> {
    const submitButton = page.locator(this.selectors.submit_button);
    
    if (await submitButton.count() > 0 && await submitButton.isEnabled()) {
      if (useHumanBehavior) {
        await humanClick(page, this.selectors.submit_button);
        console.log(`[${this.engine}] Clicked submit button`);
      } else {
        await submitButton.click();
      }
    } else {
      // Fallback to pressing Enter
      await page.keyboard.press('Enter');
    }
    
    console.log(`[${this.engine}] Waiting for response...`);
  }

  /**
   * Submit the prompt (click send button or press Enter)
   */
  protected async submitPrompt(page: Page): Promise<void> {
    const submitButton = page.locator(this.selectors.submit_button);
    
    if (await submitButton.count() > 0 && await submitButton.isEnabled()) {
      await submitButton.click();
    } else {
      // Fallback to pressing Enter
      await page.keyboard.press('Enter');
    }
  }

  /**
   * Wait for the AI response to complete
   */
  protected async waitForResponse(page: Page, timeout: number): Promise<void> {
    console.log(`[${this.engine}] Waiting for response (timeout: ${timeout}ms)...`);
    
    // Wait for streaming to complete
    const completed = await waitForStreamingComplete(page, this.selectors, timeout);
    
    if (!completed) {
      console.warn(`[${this.engine}] Response may be incomplete (timeout)`);
    }

    // Check for errors
    await this.checkForErrors(page);
  }

  /**
   * Check for error messages on the page
   */
  protected async checkForErrors(page: Page): Promise<void> {
    const errorLocator = page.locator(this.selectors.error_message);
    
    if (await errorLocator.count() > 0) {
      const errorText = await errorLocator.first().innerText().catch(() => 'Unknown error');
      throw new Error(`${this.engine} error: ${errorText}`);
    }
  }

  /**
   * Engine-specific initialization (override in subclasses)
   */
  protected async engineSpecificInit(page: Page): Promise<void> {
    // Default: no-op
  }
}

