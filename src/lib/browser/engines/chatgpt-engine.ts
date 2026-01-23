/**
 * ChatGPT Browser Engine
 * 
 * Browser automation for chatgpt.com
 * Captures real ChatGPT responses with citations, sources, and UI elements.
 * 
 * Key Features:
 * - Web search results with live citations
 * - Search chips ("Sources")
 * - Inline citations with [1], [2] markers
 * - GPT-4 / GPT-5 model selection
 * - Advanced stealth to avoid detection
 */

import type { Page, BrowserContext } from 'playwright';
import type { SupportedRegion } from '@/types';
import { ENGINE_SELECTORS, type BrowserOptions, type BrowserCaptureResult } from '../types';
import { BaseBrowserEngine, type EngineSimulationInput } from './base-engine';
import { humanType, humanClick, humanWait, humanScroll } from '../stealth';
import { bypassCloudflare, hasCloudflareChallenge } from '../advanced-cloudflare-bypass';

// ChatGPT-specific selectors (more precise than base)
const CHATGPT_SELECTORS = {
  ...ENGINE_SELECTORS.chatgpt,
  // Response containers
  response_container: '[data-message-author-role="assistant"]',
  response_text: '.markdown.prose, [class*="prose"]',
  streaming_indicator: '.result-streaming, [class*="animate-pulse"]',
  
  // Citations and sources
  citation_link: 'a[href^="http"]:not([href*="openai.com"])',
  citation_number: 'sup, [class*="citation-number"]',
  sources_section: '[class*="sources"], [class*="webSearchResults"]',
  source_card: '[class*="source-card"], [class*="WebSearchResult"]',
  source_favicon: '[class*="favicon"], img[width="16"]',
  source_title: '[class*="source-title"], h4',
  source_domain: '[class*="domain"], [class*="source-url"]',
  
  // Search indicators
  web_search_indicator: '[class*="web-search"], [class*="SearchIcon"]',
  search_query_display: '[class*="search-query"]',
  
  // Input - multiple possible selectors (ChatGPT UI changes frequently)
  prompt_input: [
    '#prompt-textarea',
    'textarea[data-id="composer-input"]',
    'textarea[placeholder*="Message"]',
    'textarea[placeholder*="message"]',
    'textarea[aria-label*="Message"]',
    'textarea[role="textbox"]',
    'div[contenteditable="true"][role="textbox"]',
    '[data-testid="composer-text-input"]',
    'textarea',
  ].join(', '),
  submit_button: [
    '[data-testid="send-button"]',
    'button[type="submit"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]',
    'button:has(svg[class*="send"])',
    'button:has(svg[class*="Send"])',
  ].join(', '),
  
  // Model selector
  model_selector: '[class*="model-selector"], [data-testid="model-switcher"]',
  
  // Conversation
  new_chat_button: '[class*="new-chat"], [data-testid="new-chat-button"]',
  conversation_list: '[class*="conversation-list"]',
  
  // Errors and loading
  error_message: '[class*="error-message"], [role="alert"]',
  loading_indicator: '[class*="loading"], [class*="thinking"]',
  rate_limit_message: '[class*="rate-limit"], [class*="capacity"]',
};

export class ChatGPTBrowserEngine extends BaseBrowserEngine {
  constructor() {
    super('chatgpt', CHATGPT_SELECTORS);
  }

  /**
   * Override: ChatGPT has unique URL structure
   */
  protected getUrlWithRegion(baseUrl: string, region: SupportedRegion): string {
    // ChatGPT now uses chatgpt.com domain
    // Default to GPT-4 for search capability
    return `https://chatgpt.com/?model=gpt-4`;
  }

  /**
   * Override: ChatGPT-specific page ready checks with human-like behavior
   */
  protected async waitForPageReady(page: Page): Promise<void> {
    // Check for Cloudflare challenge first (with timeout to prevent getting stuck)
    try {
      const isChallenge = await Promise.race([
        hasCloudflareChallenge(page),
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(false), 5000); // 5 second timeout for check
        }),
      ]);
      
      if (isChallenge) {
        console.log('[ChatGPT] Cloudflare challenge detected, attempting advanced bypass...');
        const context = page.context();
        
        // Bypass with timeout (max 45 seconds)
        const bypassed = await Promise.race([
          bypassCloudflare(page, context),
          new Promise<boolean>((resolve) => {
            setTimeout(() => {
              console.warn('[ChatGPT] Cloudflare bypass timeout, continuing anyway...');
              resolve(false);
            }, 45000); // 45 second max
          }),
        ]);
        
        if (!bypassed) {
          console.warn('[ChatGPT] Cloudflare bypass failed or timed out, but continuing...');
          // Don't throw - let it try to proceed anyway
        } else {
          console.log('[ChatGPT] Cloudflare bypass successful');
        }
      }
    } catch (error) {
      console.warn('[ChatGPT] Error during Cloudflare check:', error);
      // Continue anyway
    }
    
    // Wait for page to be interactive (use load instead of networkidle for reliability)
    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {
      console.warn('[ChatGPT] Load state timeout, continuing anyway');
    });
    
    // Wait for React to hydrate (ChatGPT is a React app)
    await page.waitForFunction(() => {
      // Check if React has loaded
      return !!(window as any).React || !!(window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
    }, { timeout: 15000 }).catch(() => {
      console.warn('[ChatGPT] React check timeout, continuing anyway');
    });
    
    // Give the page time to fully load (human-like)
    await humanWait(page, 3000, 0.3); // Longer wait for full initialization
    
    // Check if we're on a login page
    const isLoginPage = await this.checkForLoginPage(page);
    if (isLoginPage) {
      throw new Error(
        'ChatGPT requires authentication. Browser mode cannot proceed without login. ' +
        'Please use API mode (simulation_mode: "api") or configure authentication credentials.'
      );
    }

    // Wait for main app to load - try multiple selectors
    const inputSelectors = [
      '#prompt-textarea',
      'textarea[data-id="composer-input"]',
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="message"]',
      'textarea[aria-label*="Message"]',
      'textarea[role="textbox"]',
      'div[contenteditable="true"][role="textbox"]',
      '[data-testid="composer-text-input"]',
    ];
    
    let inputFound = false;
    let lastError: Error | null = null;
    
    for (const selector of inputSelectors) {
      try {
        await page.waitForSelector(selector, {
          state: 'visible',
          timeout: 10000,
        });
        console.log(`[ChatGPT] Found prompt input with selector: ${selector}`);
        inputFound = true;
        break;
      } catch (error) {
        lastError = error as Error;
        // Try next selector
      }
    }
    
    if (!inputFound) {
      // Check if page is still open before trying to evaluate
      if (page.isClosed()) {
        throw new Error(
          'ChatGPT page was closed before it could fully load. ' +
          'This may indicate the page was blocked, timed out, or detected automation.'
        );
      }
      
      // Debug: Get page info safely
      let currentUrl = 'unknown';
      let pageTitle = 'unknown';
      let bodyText = '';
      let htmlContent = '';
      let hasBlockingMessage = false;
      
      try {
        currentUrl = page.url();
        pageTitle = await page.title().catch(() => 'unknown');
        
        // Try to get HTML content to see if page loaded at all
        htmlContent = await page.content().catch(() => '');
        
        // Try to get body text
        bodyText = await page.evaluate(() => {
          if (!document.body) return '';
          return document.body.innerText?.substring(0, 500) || '';
        }).catch(() => '');
        
        // Check for blocking messages
        hasBlockingMessage = await page.evaluate(() => {
          if (!document.body) return true; // Empty body might mean blocked
          const text = document.body.innerText?.toLowerCase() || '';
          const html = document.documentElement?.innerHTML?.toLowerCase() || '';
          return text.includes('access denied') || 
                 text.includes('blocked') || 
                 text.includes('unavailable') ||
                 text.includes('try again later') ||
                 text.includes('cloudflare') ||
                 text.includes('checking your browser') ||
                 html.includes('cloudflare') ||
                 html.includes('challenge') ||
                 html.includes('just a moment');
        }).catch(() => false);
      } catch (error) {
        console.error('[ChatGPT] Error getting page info:', error);
      }
      
      console.error('[ChatGPT] Prompt input not found. Debug info:', {
        url: currentUrl,
        title: pageTitle,
        bodyPreview: bodyText.substring(0, 200),
        bodyLength: bodyText.length,
        htmlLength: htmlContent.length,
        hasBlockingMessage,
        htmlPreview: htmlContent.substring(0, 500),
      });
      
      // Check for login (safely)
      let loginRequired = false;
      try {
        if (!page.isClosed()) {
          loginRequired = await this.checkForLoginPage(page);
        }
      } catch (error) {
        console.warn('[ChatGPT] Could not check for login page:', error);
      }
      
      if (loginRequired) {
        throw new Error(
          'ChatGPT requires login to proceed. The browser was redirected to a login page. ' +
          'Use API mode instead or provide authentication credentials.'
        );
      }
      
      if (hasBlockingMessage || (bodyText.length === 0 && htmlContent.length < 1000)) {
        throw new Error(
          'ChatGPT page appears to be blocked, unavailable, or not loading properly. ' +
          `The page may be detecting automation or the proxy may be blocked. ` +
          `URL: ${currentUrl}, Body length: ${bodyText.length}, HTML length: ${htmlContent.length}. ` +
          `If HTML length is very small (<1000), the page likely didn't load.`
        );
      }
      
      throw new Error(
        `ChatGPT page did not load properly. Prompt input not found. ` +
        `URL: ${currentUrl}, Title: ${pageTitle}, Body length: ${bodyText.length}, HTML length: ${htmlContent.length}. ` +
        `This may indicate the page structure has changed or authentication failed.`
      );
    }

    // Wait for any initial loading to complete
    await page.waitForFunction(() => {
      const loading = document.querySelector('[class*="loading"], [class*="spinner"]');
      return !loading;
    }, { timeout: 10000 }).catch(() => {});

    // Human-like: wait as if reading/observing the page
    await humanWait(page, 1500, 0.4);
    
    // Human-like: maybe scroll to see the chat area
    await humanScroll(page, 'down', 100);
    await humanWait(page, 500);

    // Check for rate limit messages
    const rateLimited = await page.locator(CHATGPT_SELECTORS.rate_limit_message).count() > 0;
    if (rateLimited) {
      throw new Error('ChatGPT rate limit reached. Please try again later.');
    }

    console.log('[ChatGPT] Page ready, proceeding with human-like behavior');
  }

  /**
   * Check if we're on a login/auth page instead of the chat interface
   */
  private async checkForLoginPage(page: Page): Promise<boolean> {
    // Check if page is closed
    if (page.isClosed()) {
      return false; // Can't check, assume not login page
    }
    
    try {
      const currentUrl = page.url();
      
      // Check URL patterns that indicate login/auth
      if (
        currentUrl.includes('/auth') ||
        currentUrl.includes('/login') ||
        currentUrl.includes('auth0.com') ||
        currentUrl.includes('accounts.google.com') ||
        currentUrl.includes('login.microsoftonline.com')
      ) {
        console.warn('[ChatGPT] Detected login/auth redirect');
        return true;
      }

      // Check for login button or sign-in prompts
      const hasLoginButton = await page.evaluate(() => {
        if (!document.body) return false;
        
        const loginPatterns = [
          'button[data-testid="login-button"]',
          'a[href*="/auth/login"]',
          'button:has-text("Log in")',
          'button:has-text("Sign up")',
          '[class*="auth-page"]',
          '[class*="login-page"]',
          '[data-testid="auth-page"]',
        ];
        
        for (const pattern of loginPatterns) {
          try {
            if (document.querySelector(pattern)) return true;
          } catch {}
        }
        
        // Check page text for login prompts
        const pageText = document.body?.innerText?.toLowerCase() || '';
        if (
          (pageText.includes('log in') || pageText.includes('sign up')) &&
          !document.querySelector('#prompt-textarea')
        ) {
          return true;
        }
        
        return false;
      });

      return hasLoginButton;
    } catch (error) {
      // If page is closed or error occurs, assume not login page
      console.warn('[ChatGPT] Error checking for login page:', error);
      return false;
    }
  }

  /**
   * Override: ChatGPT uses a special textarea with human-like typing
   */
  protected async sendPrompt(
    page: Page,
    prompt: string,
    language: import('@/types').SupportedLanguage
  ): Promise<void> {
    const fullPrompt = language === 'ar'
      ? `${prompt}\n\n(Please respond in Arabic)`
      : prompt;

    console.log(`[ChatGPT] Sending prompt: "${fullPrompt.slice(0, 100)}..."`);

    // Human-like: wait a bit before starting to type (reading the page)
    await humanWait(page, 1500, 0.5);
    
    // Human-like: maybe scroll a tiny bit
    await humanScroll(page, 'down', 50);
    await humanWait(page, 500);

    // Click the input area with human-like mouse movement
    await humanClick(page, CHATGPT_SELECTORS.prompt_input);
    await humanWait(page, 300);

    // Type with human-like delays (this is critical to avoid detection)
    await humanType(page, CHATGPT_SELECTORS.prompt_input, fullPrompt);
    
    // Human-like pause before submitting (reviewing what was typed)
    await humanWait(page, 800, 0.4);

    // Submit with slight delay
    await this.submitPromptHumanLike(page);
  }
  
  /**
   * Submit with human-like behavior
   */
  private async submitPromptHumanLike(page: Page): Promise<void> {
    // Try button first
    const submitButton = page.locator(CHATGPT_SELECTORS.submit_button);
    
    // Wait for button to be enabled
    await page.waitForFunction(() => {
      const btn = document.querySelector('[data-testid="send-button"], button[type="submit"]');
      return btn && !btn.hasAttribute('disabled');
    }, { timeout: 5000 }).catch(() => {});

    // Small random delay before clicking
    await humanWait(page, 200, 0.3);

    if (await submitButton.count() > 0) {
      const isEnabled = await submitButton.isEnabled();
      if (isEnabled) {
        await humanClick(page, CHATGPT_SELECTORS.submit_button);
        console.log('[ChatGPT] Clicked submit button');
        return;
      }
    }

    // Fallback: press Enter
    await page.keyboard.press('Enter');
    console.log('[ChatGPT] Pressed Enter to submit');
  }


  /**
   * Override: ChatGPT-specific response waiting
   */
  protected async waitForResponse(page: Page, timeout: number): Promise<void> {
    console.log('[ChatGPT] Waiting for response...');
    const startTime = Date.now();

    // Wait for assistant message to appear
    await page.waitForSelector(CHATGPT_SELECTORS.response_container, {
      timeout: timeout / 2,
    });

    // Wait for streaming to complete
    while (Date.now() - startTime < timeout) {
      // Check for streaming indicators
      const isStreaming = await page.evaluate(() => {
        // Check for streaming class
        const streaming = document.querySelector('.result-streaming, [class*="animate"]');
        // Check for cursor blinking
        const cursor = document.querySelector('[class*="cursor"], [class*="caret"]');
        // Check if response is still being generated
        const generating = document.querySelector('[class*="generating"]');
        return !!streaming || !!cursor || !!generating;
      });

      if (!isStreaming) {
        // Double-check after a short delay
        await page.waitForTimeout(1000);
        
        const stillStreaming = await page.evaluate(() => {
          return !!document.querySelector('.result-streaming, [class*="generating"]');
        });

        if (!stillStreaming) {
          console.log('[ChatGPT] Response complete');
          break;
        }
      }

      await page.waitForTimeout(200);
    }

    // Check for web search (look for sources section)
    const hasWebSearch = await page.locator(CHATGPT_SELECTORS.sources_section).count() > 0;
    if (hasWebSearch) {
      console.log('[ChatGPT] Web search was performed, sources available');
      
      // Wait for sources to fully load
      await page.waitForTimeout(1000);
    }

    // Check for errors
    await this.checkForErrors(page);
  }

  /**
   * Override: ChatGPT-specific error checking
   */
  protected async checkForErrors(page: Page): Promise<void> {
    // Check for error messages
    const errorLocator = page.locator(CHATGPT_SELECTORS.error_message);
    if (await errorLocator.count() > 0) {
      const errorText = await errorLocator.first().innerText().catch(() => '');
      
      if (errorText.toLowerCase().includes('rate limit')) {
        throw new Error('ChatGPT rate limit exceeded');
      }
      if (errorText.toLowerCase().includes('capacity')) {
        throw new Error('ChatGPT at capacity');
      }
      if (errorText) {
        throw new Error(`ChatGPT error: ${errorText}`);
      }
    }

    // Check for conversation errors
    const conversationError = await page.locator('[class*="error"], [role="alert"]').count() > 0;
    if (conversationError) {
      console.warn('[ChatGPT] Warning: Possible error in conversation');
    }
  }

  /**
   * Enable web search mode (if available)
   */
  async enableWebSearch(page: Page): Promise<boolean> {
    try {
      // Look for web search toggle or model that supports it
      const searchToggle = page.locator('[class*="web-search-toggle"], [aria-label*="web search"]');
      
      if (await searchToggle.count() > 0) {
        const isEnabled = await searchToggle.getAttribute('aria-checked');
        if (isEnabled !== 'true') {
          await searchToggle.click();
          console.log('[ChatGPT] Enabled web search');
        }
        return true;
      }

      // Check if using GPT-4 with browsing
      const modelIndicator = await page.locator(CHATGPT_SELECTORS.model_selector).innerText().catch(() => '');
      if (modelIndicator.toLowerCase().includes('gpt-4')) {
        console.log('[ChatGPT] Using GPT-4 (web search may be available)');
        return true;
      }

      return false;
    } catch (error) {
      console.warn('[ChatGPT] Could not enable web search:', error);
      return false;
    }
  }

  /**
   * Start a new conversation (clears context)
   */
  async startNewConversation(page: Page): Promise<void> {
    const newChatButton = page.locator(CHATGPT_SELECTORS.new_chat_button);
    
    if (await newChatButton.count() > 0) {
      await newChatButton.click();
      await page.waitForTimeout(500);
      console.log('[ChatGPT] Started new conversation');
    }
  }
}

// Export singleton instance
export const chatGPTEngine = new ChatGPTBrowserEngine();

