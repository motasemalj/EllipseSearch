/**
 * Grok Browser Engine
 * 
 * Browser automation for grok.x.ai
 * Captures real Grok responses with X (Twitter) integration.
 * 
 * Key Features:
 * - Real-time X/Twitter data
 * - Web search results
 * - KOL (Key Opinion Leader) posts
 * - Trending topics integration
 */

import type { Page } from 'playwright';
import type { SupportedRegion, SupportedLanguage } from '@/types';
import { ENGINE_SELECTORS } from '../types';
import { BaseBrowserEngine } from './base-engine';

// Grok-specific selectors
const GROK_SELECTORS = {
  ...ENGINE_SELECTORS.grok,
  // Response
  response_container: '[class*="message-content"], [class*="grok-response"], [data-testid="grok-message"]',
  response_text: '[class*="markdown"], [class*="response-text"]',
  streaming_indicator: '[class*="typing"], [class*="loading"], [class*="thinking"]',
  
  // X/Twitter integration
  x_post_embed: '.x-post-embed, [class*="tweet-embed"], [class*="post-embed"]',
  x_post_author: '[class*="author"], [class*="username"]',
  x_post_text: '[class*="tweet-text"], [class*="post-text"]',
  x_post_metrics: '[class*="metrics"], [class*="engagement"]',
  
  // Web sources
  web_source: '[class*="web-source"], [class*="source-link"]',
  source_card: '.source-preview, [class*="source-card"]',
  source_title: '[class*="source-title"]',
  source_domain: '[class*="domain"]',
  
  // Trending/real-time
  trending_section: '[class*="trending"], [class*="real-time"]',
  trending_topic: '[class*="trend-item"]',
  
  // Input
  prompt_input: 'textarea[placeholder*="message"], [class*="chat-input"]',
  submit_button: 'button[type="submit"], [class*="send-button"]',
  
  // Conversation
  new_chat_button: '[class*="new-chat"], [aria-label*="New"]',
  
  // Mode (Fun/Accurate)
  mode_selector: '[class*="mode-selector"]',
  mode_option: '[class*="mode-option"]',
  
  // Errors
  error_message: '.error-banner, [class*="error"]',
  loading_indicator: '.thinking-indicator, [class*="loading"]',
  
  // X login
  x_login_button: 'a[href*="twitter.com"], [class*="login-with-x"]',
};

export class GrokBrowserEngine extends BaseBrowserEngine {
  constructor() {
    super('grok', GROK_SELECTORS);
  }

  /**
   * Override: Grok URL
   */
  protected getUrlWithRegion(baseUrl: string, region: SupportedRegion): string {
    void region;
    // Grok doesn't have region-specific URLs
    return baseUrl;
  }

  /**
   * Override: Grok-specific page ready
   */
  protected async waitForPageReady(page: Page): Promise<void> {
    // Wait for input
    await page.waitForSelector(GROK_SELECTORS.prompt_input, {
      state: 'visible',
      timeout: 20000,
    });

    // Check for X/Twitter login requirement
    const loginRequired = await page.locator(GROK_SELECTORS.x_login_button).count() > 0;
    if (loginRequired) {
      console.warn('[Grok] X/Twitter login may be required for full features');
    }

    // Wait for any loading to complete
    await page.waitForTimeout(500);
  }

  /**
   * Override: Grok prompt sending
   */
  protected async sendPrompt(
    page: Page,
    prompt: string,
    language: SupportedLanguage
  ): Promise<void> {
    const fullPrompt = language === 'ar'
      ? `${prompt}\n\n(Please respond in Arabic)`
      : prompt;

    console.log(`[Grok] Sending prompt: "${fullPrompt.slice(0, 100)}..."`);

    const input = page.locator(GROK_SELECTORS.prompt_input);
    await input.click();
    await page.waitForTimeout(100);

    // Fill the prompt
    await input.fill(fullPrompt);
    await page.waitForTimeout(200);

    await this.submitPrompt(page);
  }

  /**
   * Override: Grok submit
   */
  protected async submitPrompt(page: Page): Promise<void> {
    const submitButton = page.locator(GROK_SELECTORS.submit_button);
    
    if (await submitButton.count() > 0 && await submitButton.isEnabled()) {
      await submitButton.click();
      console.log('[Grok] Clicked submit button');
    } else {
      await page.keyboard.press('Enter');
      console.log('[Grok] Pressed Enter to submit');
    }
  }

  /**
   * Override: Grok response waiting with X integration
   */
  protected async waitForResponse(page: Page, timeout: number): Promise<void> {
    console.log('[Grok] Waiting for response...');
    const startTime = Date.now();

    // Wait for response container
    await page.waitForSelector(GROK_SELECTORS.response_container, {
      timeout: timeout / 2,
    }).catch(() => {});

    // Wait for streaming to complete
    while (Date.now() - startTime < timeout) {
      const isStreaming = await page.evaluate(() => {
        const thinking = document.querySelector('[class*="thinking"], [class*="typing"]');
        const loading = document.querySelector('[class*="loading"]');
        return !!thinking || !!loading;
      });

      if (!isStreaming) {
        await page.waitForTimeout(1000);
        
        const stillStreaming = await page.locator(GROK_SELECTORS.streaming_indicator).count() > 0;
        if (!stillStreaming) {
          console.log('[Grok] Response complete');
          break;
        }
      }

      await page.waitForTimeout(200);
    }

    // Check for X posts
    const xPostCount = await page.locator(GROK_SELECTORS.x_post_embed).count();
    if (xPostCount > 0) {
      console.log(`[Grok] Found ${xPostCount} X posts embedded`);
    }

    // Check for web sources
    const sourceCount = await page.locator(GROK_SELECTORS.source_card).count();
    console.log(`[Grok] Found ${sourceCount} web sources`);

    await this.checkForErrors(page);
  }

  /**
   * Extract X/Twitter posts from response
   */
  async extractXPosts(page: Page): Promise<Array<{
    author: string;
    handle: string;
    text: string;
    timestamp?: string;
    likes?: number;
    retweets?: number;
    post_url: string;
  }>> {
    const posts: Array<{
      author: string;
      handle: string;
      text: string;
      timestamp?: string;
      likes?: number;
      retweets?: number;
      post_url: string;
    }> = [];

    try {
      const postElements = await page.locator(GROK_SELECTORS.x_post_embed).all();

      for (const post of postElements) {
        const author = await post.locator('[class*="name"], [class*="author"]').first().innerText().catch(() => '');
        const handle = await post.locator('[class*="username"], [class*="handle"]').first().innerText().catch(() => '');
        const text = await post.locator(GROK_SELECTORS.x_post_text).first().innerText().catch(() => '');
        const timestamp = (await post.locator('time, [class*="timestamp"]').first().getAttribute('datetime').catch(() => null)) || undefined;
        
        // Extract metrics
        const metricsText = await post.locator(GROK_SELECTORS.x_post_metrics).innerText().catch(() => '');
        const likesMatch = metricsText.match(/(\d+(?:,\d+)*)\s*likes?/i);
        const retweetsMatch = metricsText.match(/(\d+(?:,\d+)*)\s*retweets?/i);
        
        const likes = likesMatch ? parseInt(likesMatch[1].replace(/,/g, '')) : undefined;
        const retweets = retweetsMatch ? parseInt(retweetsMatch[1].replace(/,/g, '')) : undefined;

        // Get post URL
        const postUrl = await post.locator('a[href*="x.com"], a[href*="twitter.com"]').first().getAttribute('href').catch(() => '');

        if (text) {
          posts.push({
            author: author.trim(),
            handle: handle.trim(),
            text: text.trim(),
            timestamp,
            likes,
            retweets,
            post_url: postUrl || '',
          });
        }
      }
    } catch (error) {
      console.warn('[Grok] Error extracting X posts:', error);
    }

    return posts;
  }

  /**
   * Set Grok mode (Fun or Accurate)
   */
  async setMode(page: Page, mode: 'fun' | 'accurate'): Promise<boolean> {
    try {
      const modeSelector = page.locator(GROK_SELECTORS.mode_selector);
      
      if (await modeSelector.count() > 0) {
        await modeSelector.click();
        await page.waitForTimeout(200);

        const modeButton = page.locator(`${GROK_SELECTORS.mode_option}:has-text("${mode}")`);
        if (await modeButton.count() > 0) {
          await modeButton.click();
          console.log(`[Grok] Set mode: ${mode}`);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.warn('[Grok] Could not set mode:', error);
      return false;
    }
  }

  /**
   * Get trending topics from Grok
   */
  async getTrendingTopics(page: Page): Promise<string[]> {
    const topics: string[] = [];

    try {
      const trendElements = await page.locator(GROK_SELECTORS.trending_topic).all();
      
      for (const trend of trendElements) {
        const text = await trend.innerText();
        if (text && text.length > 2) {
          topics.push(text.trim());
        }
      }
    } catch (error) {
      console.warn('[Grok] Error getting trending topics:', error);
    }

    return topics.slice(0, 10);
  }

  /**
   * Start new conversation
   */
  async startNewConversation(page: Page): Promise<void> {
    const newChatButton = page.locator(GROK_SELECTORS.new_chat_button);
    
    if (await newChatButton.count() > 0) {
      await newChatButton.click();
      await page.waitForTimeout(500);
      console.log('[Grok] Started new conversation');
    }
  }
}

// Export singleton
export const grokEngine = new GrokBrowserEngine();

