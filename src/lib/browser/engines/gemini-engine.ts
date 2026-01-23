/**
 * Gemini Browser Engine
 * 
 * Browser automation for gemini.google.com
 * Captures real Gemini responses with Google Search grounding.
 * 
 * Key Features:
 * - Google Search grounding with source chips
 * - Grounding chunks with inline citations
 * - Google-specific knowledge panels
 * - YouTube video suggestions
 */

import type { Page } from 'playwright';
import type { SupportedRegion, SupportedLanguage } from '@/types';
import { ENGINE_SELECTORS } from '../types';
import { BaseBrowserEngine } from './base-engine';

// Gemini-specific selectors
const GEMINI_SELECTORS = {
  ...ENGINE_SELECTORS.gemini,
  // Response
  response_container: '.model-response-text, [class*="response-container"], message-content',
  response_text: '.markdown-main-panel, [class*="markdown"], [class*="response-text"]',
  streaming_indicator: '.loading-state, [class*="loading"], [class*="typing"], [class*="pending"]',
  
  // Grounding and citations
  grounding_section: '.grounding-sources, [class*="grounding"], [class*="sources"]',
  grounding_chunk: '.grounding-chunk, [class*="source-chip"], [class*="citation-chip"]',
  citation_link: 'a.source-link, [class*="source-link"], a[href*="http"]',
  
  // Source chips (Google's way of showing sources)
  source_chip: '.source-chip, [class*="chip"], [class*="source-button"]',
  source_chip_icon: '[class*="favicon"], [class*="source-icon"]',
  source_chip_text: '[class*="source-text"], [class*="chip-text"]',
  
  // Search queries Gemini ran
  search_query_indicator: '[class*="search-query"], [class*="web-search"]',
  
  // Input
  prompt_input: 'rich-textarea, [contenteditable="true"], textarea',
  submit_button: 'button[aria-label*="Send"], [class*="send-button"], button[type="submit"]',
  
  // Conversation
  new_chat_button: '[aria-label*="New chat"], [class*="new-conversation"]',
  conversation_item: '[class*="conversation-item"]',
  
  // Extensions (like Google Search, Maps, etc.)
  extension_indicator: '[class*="extension"], [class*="google-search"]',
  
  // Errors
  error_message: '.error-container, [class*="error"], [role="alert"]',
  loading_indicator: '.loading-indicator, [class*="loading"]',
};

export class GeminiBrowserEngine extends BaseBrowserEngine {
  constructor() {
    super('gemini', GEMINI_SELECTORS);
  }

  /**
   * Override: Gemini URL with region
   */
  protected getUrlWithRegion(baseUrl: string, region: SupportedRegion): string {
    // Gemini uses hl parameter for language/region
    const regionMap: Record<SupportedRegion, string> = {
      global: '',
      us: 'en-US',
      uk: 'en-GB',
      ae: 'ar-AE',
      sa: 'ar-SA',
      de: 'de-DE',
      fr: 'fr-FR',
      in: 'en-IN',
      au: 'en-AU',
      ca: 'en-CA',
      jp: 'ja-JP',
      sg: 'en-SG',
      br: 'pt-BR',
      mx: 'es-MX',
      nl: 'nl-NL',
      es: 'es-ES',
      it: 'it-IT',
      eg: 'ar-EG',
      kw: 'ar-KW',
      qa: 'ar-QA',
      bh: 'ar-BH',
    };

    const hl = regionMap[region];
    return hl ? `${baseUrl}/app?hl=${hl}` : `${baseUrl}/app`;
  }

  /**
   * Override: Gemini-specific page ready
   */
  protected async waitForPageReady(page: Page): Promise<void> {
    // Gemini uses a custom rich-textarea component
    await page.waitForSelector(GEMINI_SELECTORS.prompt_input, {
      state: 'visible',
      timeout: 20000,
    });

    // Wait for extensions to load
    await page.waitForTimeout(1000);

    // Check for Google account requirement
    const loginRequired = await page.locator('a[href*="accounts.google.com"]').count() > 0;
    if (loginRequired) {
      console.warn('[Gemini] Google account login may be required');
    }
  }

  /**
   * Override: Gemini uses contenteditable div
   */
  protected async sendPrompt(
    page: Page,
    prompt: string,
    language: SupportedLanguage
  ): Promise<void> {
    const fullPrompt = language === 'ar'
      ? `${prompt}\n\nالرجاء الرد باللغة العربية`
      : prompt;

    console.log(`[Gemini] Sending prompt: "${fullPrompt.slice(0, 100)}..."`);

    // Gemini often uses rich-textarea or contenteditable
    const input = page.locator(GEMINI_SELECTORS.prompt_input);
    await input.click();
    await page.waitForTimeout(100);

    // Try different input methods
    try {
      // Method 1: Direct fill
      await input.fill(fullPrompt);
    } catch {
      try {
        // Method 2: Type into contenteditable
        await input.evaluate((el, text) => {
          if (el instanceof HTMLElement) {
            el.textContent = text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, fullPrompt);
      } catch {
        // Method 3: Type character by character
        await input.type(fullPrompt, { delay: 30 });
      }
    }

    await page.waitForTimeout(300);
    await this.submitPrompt(page);
  }

  /**
   * Override: Gemini submit
   */
  protected async submitPrompt(page: Page): Promise<void> {
    const submitButton = page.locator(GEMINI_SELECTORS.submit_button);
    
    // Wait for button to be enabled
    await page.waitForFunction(() => {
      const btn = document.querySelector('button[aria-label*="Send"], [class*="send-button"]');
      return btn && !btn.hasAttribute('disabled');
    }, { timeout: 5000 }).catch(() => {});

    if (await submitButton.count() > 0 && await submitButton.isEnabled()) {
      await submitButton.click();
      console.log('[Gemini] Clicked submit button');
    } else {
      await page.keyboard.press('Enter');
      console.log('[Gemini] Pressed Enter to submit');
    }
  }

  /**
   * Override: Gemini response waiting with grounding
   */
  protected async waitForResponse(page: Page, timeout: number): Promise<void> {
    console.log('[Gemini] Waiting for response...');
    const startTime = Date.now();

    // Wait for response container
    await page.waitForSelector(GEMINI_SELECTORS.response_container, {
      timeout: timeout / 2,
    }).catch(() => {});

    // Wait for streaming to complete
    while (Date.now() - startTime < timeout) {
      const isStreaming = await page.evaluate(() => {
        const loading = document.querySelector('.loading-state, [class*="pending"], [class*="typing"]');
        const cursor = document.querySelector('[class*="cursor"], [class*="caret"]');
        return !!loading || !!cursor;
      });

      if (!isStreaming) {
        await page.waitForTimeout(1000);
        
        const stillStreaming = await page.locator(GEMINI_SELECTORS.streaming_indicator).count() > 0;
        if (!stillStreaming) {
          console.log('[Gemini] Response complete');
          break;
        }
      }

      await page.waitForTimeout(200);
    }

    // Check for grounding sources
    const hasGrounding = await page.locator(GEMINI_SELECTORS.grounding_section).count() > 0;
    if (hasGrounding) {
      console.log('[Gemini] Grounding sources available');
      
      // Count grounding chips
      const chipCount = await page.locator(GEMINI_SELECTORS.source_chip).count();
      console.log(`[Gemini] Found ${chipCount} grounding chips`);
    }

    await this.checkForErrors(page);
  }

  /**
   * Extract grounding metadata from Gemini
   */
  async extractGroundingMetadata(page: Page): Promise<{
    search_queries: string[];
    grounding_chunks: Array<{
      text: string;
      source_url: string;
      source_title: string;
    }>;
  }> {
    const result = {
      search_queries: [] as string[],
      grounding_chunks: [] as Array<{
        text: string;
        source_url: string;
        source_title: string;
      }>,
    };

    try {
      // Extract search queries Gemini ran
      const queryElements = await page.locator(GEMINI_SELECTORS.search_query_indicator).all();
      for (const el of queryElements) {
        const text = await el.innerText();
        if (text) {
          result.search_queries.push(text.trim());
        }
      }

      // Extract grounding chunks
      const chunkElements = await page.locator(GEMINI_SELECTORS.grounding_chunk).all();
      for (const chunk of chunkElements) {
        const url = await chunk.locator('a').first().getAttribute('href').catch(() => '');
        const title = await chunk.innerText().catch(() => '');
        
        if (url) {
          result.grounding_chunks.push({
            text: title,
            source_url: url,
            source_title: title.slice(0, 100),
          });
        }
      }

      // Also extract source chips
      const chipElements = await page.locator(GEMINI_SELECTORS.source_chip).all();
      for (const chip of chipElements) {
        const url = await chip.locator('a').first().getAttribute('href').catch(() => '');
        const title = await chip.locator(GEMINI_SELECTORS.source_chip_text).innerText().catch(() => '');
        
        if (url && !result.grounding_chunks.find(c => c.source_url === url)) {
          result.grounding_chunks.push({
            text: '',
            source_url: url,
            source_title: title,
          });
        }
      }

    } catch (error) {
      console.warn('[Gemini] Error extracting grounding metadata:', error);
    }

    console.log(`[Gemini] Extracted ${result.search_queries.length} queries, ${result.grounding_chunks.length} chunks`);
    return result;
  }

  /**
   * Start new conversation
   */
  async startNewConversation(page: Page): Promise<void> {
    const newChatButton = page.locator(GEMINI_SELECTORS.new_chat_button);
    
    if (await newChatButton.count() > 0) {
      await newChatButton.click();
      await page.waitForTimeout(500);
      console.log('[Gemini] Started new conversation');
    }
  }
}

// Export singleton
export const geminiEngine = new GeminiBrowserEngine();

