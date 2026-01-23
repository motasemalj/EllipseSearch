/**
 * Perplexity Browser Engine
 * 
 * Browser automation for perplexity.ai
 * Captures real Perplexity responses with inline citations and source cards.
 * 
 * Key Features:
 * - Numbered inline citations [1], [2], [3]
 * - Source cards with favicons and snippets
 * - Related questions
 * - Focus modes (Web, Academic, etc.)
 */

import type { Page } from 'playwright';
import type { SupportedRegion, SupportedLanguage } from '@/types';
import { ENGINE_SELECTORS } from '../types';
import { BaseBrowserEngine } from './base-engine';

// Perplexity-specific selectors
const PERPLEXITY_SELECTORS = {
  ...ENGINE_SELECTORS.perplexity,
  // Response
  response_container: '[class*="prose"], [class*="response-text"], [data-testid="response"]',
  response_text: '[class*="prose"] > div, [class*="markdown"]',
  streaming_indicator: '[class*="animate-pulse"], [class*="typing"], [class*="loading-dot"]',
  
  // Citations
  citation_link: 'a[class*="citation"], [data-testid="citation-link"]',
  citation_number: '[class*="citation-number"], sup',
  citation_popup: '[class*="citation-popup"], [class*="tooltip"]',
  
  // Sources panel
  sources_section: '[class*="sources-section"], [data-testid="sources"]',
  source_card: '[class*="source-card"], [class*="source-item"], [data-testid="source"]',
  source_favicon: '[class*="favicon"], img[class*="source-icon"]',
  source_title: '[class*="source-title"], h4, [class*="title"]',
  source_domain: '[class*="domain"], [class*="source-url"], [class*="hostname"]',
  source_snippet: '[class*="snippet"], [class*="description"], p',
  
  // Related questions
  related_section: '[class*="related"], [class*="suggestions"]',
  related_question: '[class*="related-question"], button[class*="suggestion"]',
  
  // Input
  prompt_input: 'textarea[placeholder*="Ask"], textarea[data-testid="search-input"]',
  submit_button: 'button[type="submit"], button[aria-label*="Search"]',
  
  // Focus modes
  focus_selector: '[class*="focus-selector"], [data-testid="focus-mode"]',
  focus_option: '[class*="focus-option"]',
  
  // Pro features
  pro_badge: '[class*="pro-badge"], [class*="premium"]',
  
  // Errors
  error_message: '[class*="error"], [role="alert"]',
  loading_indicator: '[class*="loading"], [class*="spinner"]',
};

export class PerplexityBrowserEngine extends BaseBrowserEngine {
  constructor() {
    super('perplexity', PERPLEXITY_SELECTORS);
  }

  /**
   * Override: Perplexity URL handling
   */
  protected getUrlWithRegion(baseUrl: string, region: SupportedRegion): string {
    void region;
    // Perplexity doesn't have explicit region URLs, use query params
    return `${baseUrl}/search`;
  }

  /**
   * Override: Perplexity-specific page ready
   */
  protected async waitForPageReady(page: Page): Promise<void> {
    // Check for login requirement
    const needsLogin = await this.checkForLoginPage(page);
    if (needsLogin) {
      console.warn('[Perplexity] Login page detected, proceeding with guest mode limitations');
    }

    // Wait for search input
    try {
      await page.waitForSelector(PERPLEXITY_SELECTORS.prompt_input, {
        state: 'visible',
        timeout: 15000,
      });
    } catch {
      // Check again for login page
      if (await this.checkForLoginPage(page)) {
        throw new Error(
          'Perplexity requires authentication for full functionality. ' +
          'Use API mode (simulation_mode: "api") for better results without login.'
        );
      }
      throw new Error('Perplexity page did not load properly. Search input not found.');
    }

    // Wait for any loading to complete
    await page.waitForFunction(() => {
      const loading = document.querySelector('[class*="loading"], [class*="spinner"]');
      return !loading;
    }, { timeout: 10000 }).catch(() => {});

    await page.waitForTimeout(300);
  }

  /**
   * Check if login is required
   */
  private async checkForLoginPage(page: Page): Promise<boolean> {
    const currentUrl = page.url();
    
    // Check URL patterns
    if (
      currentUrl.includes('/login') ||
      currentUrl.includes('/signin') ||
      currentUrl.includes('/auth')
    ) {
      return true;
    }

    // Check for login modal or buttons
    const hasLoginPrompt = await page.evaluate(() => {
      const modal = document.querySelector('[class*="modal"]');
      return !!(modal && (
        modal.textContent?.includes('Sign in') ||
        modal.textContent?.includes('Log in')
      ));
    });

    return hasLoginPrompt;
  }

  /**
   * Override: Perplexity prompt sending
   */
  protected async sendPrompt(
    page: Page,
    prompt: string,
    language: SupportedLanguage
  ): Promise<void> {
    const fullPrompt = language === 'ar'
      ? `${prompt} (أجب بالعربية)`
      : prompt;

    console.log(`[Perplexity] Sending prompt: "${fullPrompt.slice(0, 100)}..."`);

    // Clear any existing input
    const input = page.locator(PERPLEXITY_SELECTORS.prompt_input);
    await input.click();
    await page.waitForTimeout(100);

    // Fill the prompt
    await input.fill(fullPrompt);
    await page.waitForTimeout(200);

    // Submit
    await this.submitPrompt(page);
  }

  /**
   * Override: Perplexity submit
   */
  protected async submitPrompt(page: Page): Promise<void> {
    const submitButton = page.locator(PERPLEXITY_SELECTORS.submit_button);
    
    if (await submitButton.count() > 0 && await submitButton.isEnabled()) {
      await submitButton.click();
      console.log('[Perplexity] Clicked submit button');
    } else {
      await page.keyboard.press('Enter');
      console.log('[Perplexity] Pressed Enter to submit');
    }
  }

  /**
   * Override: Perplexity-specific response waiting
   */
  protected async waitForResponse(page: Page, timeout: number): Promise<void> {
    console.log('[Perplexity] Waiting for response...');
    const startTime = Date.now();

    // Wait for response to appear
    await page.waitForSelector(PERPLEXITY_SELECTORS.response_container, {
      timeout: timeout / 2,
    }).catch(() => {});

    // Wait for streaming to complete
    while (Date.now() - startTime < timeout) {
      const isStreaming = await page.evaluate(() => {
        // Check for typing indicator
        const typing = document.querySelector('[class*="animate-pulse"], [class*="typing"]');
        // Check for loading dots
        const loading = document.querySelector('[class*="loading-dot"]');
        // Check for cursor
        const cursor = document.querySelector('[class*="cursor"]');
        return !!typing || !!loading || !!cursor;
      });

      if (!isStreaming) {
        await page.waitForTimeout(800);
        
        // Double check
        const stillStreaming = await page.locator(PERPLEXITY_SELECTORS.streaming_indicator).count() > 0;
        if (!stillStreaming) {
          console.log('[Perplexity] Response complete');
          break;
        }
      }

      await page.waitForTimeout(200);
    }

    // Wait for sources to load
    await page.waitForSelector(PERPLEXITY_SELECTORS.source_card, { timeout: 5000 }).catch(() => {});
    
    // Count sources
    const sourceCount = await page.locator(PERPLEXITY_SELECTORS.source_card).count();
    console.log(`[Perplexity] Found ${sourceCount} sources`);

    // Check for related questions
    const relatedCount = await page.locator(PERPLEXITY_SELECTORS.related_question).count();
    console.log(`[Perplexity] Found ${relatedCount} related questions`);

    await this.checkForErrors(page);
  }

  /**
   * Set focus mode (Web, Academic, Writing, etc.)
   */
  async setFocusMode(page: Page, mode: 'web' | 'academic' | 'writing' | 'wolfram' | 'youtube' | 'reddit'): Promise<boolean> {
    try {
      const focusSelector = page.locator(PERPLEXITY_SELECTORS.focus_selector);
      
      if (await focusSelector.count() > 0) {
        await focusSelector.click();
        await page.waitForTimeout(200);

        // Find and click the specific mode
        const modeButton = page.locator(`${PERPLEXITY_SELECTORS.focus_option}:has-text("${mode}")`);
        if (await modeButton.count() > 0) {
          await modeButton.click();
          console.log(`[Perplexity] Set focus mode: ${mode}`);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.warn('[Perplexity] Could not set focus mode:', error);
      return false;
    }
  }

  /**
   * Extract citations with their context
   */
  async extractDetailedCitations(page: Page): Promise<Array<{
    number: number;
    url: string;
    title: string;
    domain: string;
    snippet: string;
    context: string;
  }>> {
    const citations: Array<{
      number: number;
      url: string;
      title: string;
      domain: string;
      snippet: string;
      context: string;
    }> = [];

    try {
      const citationElements = await page.locator(PERPLEXITY_SELECTORS.citation_link).all();

      for (let i = 0; i < citationElements.length; i++) {
        const element = citationElements[i];
        
        const href = await element.getAttribute('href') || '';
        const text = await element.innerText();
        
        // Get context around citation
        const context = await element.evaluate((el) => {
          const parent = el.closest('p, li');
          return parent?.textContent || '';
        });

        // Extract number from text or position
        const num = parseInt(text.replace(/[\[\]]/g, '')) || i + 1;

        // Get domain
        let domain = '';
        try {
          domain = new URL(href).hostname.replace('www.', '');
        } catch {}

        // Try to find corresponding source card
        const sourceCard = page.locator(`${PERPLEXITY_SELECTORS.source_card}`).nth(i);
        const title = await sourceCard.locator(PERPLEXITY_SELECTORS.source_title).innerText().catch(() => '');
        const snippet = await sourceCard.locator(PERPLEXITY_SELECTORS.source_snippet).innerText().catch(() => '');

        citations.push({
          number: num,
          url: href,
          title: title || domain,
          domain,
          snippet: snippet.slice(0, 300),
          context: context.slice(0, 500),
        });
      }
    } catch (error) {
      console.warn('[Perplexity] Error extracting detailed citations:', error);
    }

    return citations;
  }

  /**
   * Get related questions
   */
  async getRelatedQuestions(page: Page): Promise<string[]> {
    const questions: string[] = [];

    try {
      const questionElements = await page.locator(PERPLEXITY_SELECTORS.related_question).all();
      
      for (const element of questionElements) {
        const text = await element.innerText();
        if (text && text.length > 5) {
          questions.push(text.trim());
        }
      }
    } catch (error) {
      console.warn('[Perplexity] Error getting related questions:', error);
    }

    return questions;
  }
}

// Export singleton
export const perplexityEngine = new PerplexityBrowserEngine();

