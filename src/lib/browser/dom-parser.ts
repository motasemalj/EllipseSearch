/**
 * DOM Parser for AI Engine Responses
 * 
 * Extracts structured data from the DOM of AI engine responses.
 * This captures UI elements that APIs don't expose: citations,
 * search chips, product tiles, knowledge panels, etc.
 */

import type { Page, Locator } from 'playwright';
import type {
  SupportedEngine,
  BrowserCitation,
  SearchChip,
  ProductTile,
  SourceCard,
  KnowledgePanel,
  DOMSnapshot,
  ENGINE_SELECTORS,
} from './types';

// ===========================================
// Main Parser Class
// ===========================================

export class DOMParser {
  private page: Page;
  private engine: SupportedEngine;
  private selectors: typeof ENGINE_SELECTORS[SupportedEngine];

  constructor(page: Page, engine: SupportedEngine, selectors: typeof ENGINE_SELECTORS[SupportedEngine]) {
    this.page = page;
    this.engine = engine;
    this.selectors = selectors;
  }

  /**
   * Extract all structured data from the current page
   */
  async extractAll(): Promise<{
    answer_html: string;
    answer_text: string;
    answer_markdown: string;
    citations: BrowserCitation[];
    search_chips: SearchChip[];
    product_tiles: ProductTile[];
    source_cards: SourceCard[];
    knowledge_panel: KnowledgePanel | null;
    suggested_followups: string[];
    dom_snapshot: DOMSnapshot;
  }> {
    const [
      { html, text, markdown },
      citations,
      search_chips,
      product_tiles,
      source_cards,
      knowledge_panel,
      suggested_followups,
      dom_snapshot,
    ] = await Promise.all([
      this.extractResponseContent(),
      this.extractCitations(),
      this.extractSearchChips(),
      this.extractProductTiles(),
      this.extractSourceCards(),
      this.extractKnowledgePanel(),
      this.extractSuggestedFollowups(),
      this.captureDOMSnapshot(),
    ]);

    return {
      answer_html: html,
      answer_text: text,
      answer_markdown: markdown,
      citations,
      search_chips,
      product_tiles,
      source_cards,
      knowledge_panel,
      suggested_followups,
      dom_snapshot,
    };
  }

  /**
   * Extract the main response content
   */
  async extractResponseContent(): Promise<{ html: string; text: string; markdown: string }> {
    try {
      const container = this.page.locator(this.selectors.response_container).last();
      
      // Wait for content to be present
      await container.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

      const html = await container.innerHTML().catch(() => '');
      const text = await container.innerText().catch(() => '');
      
      // Convert HTML to markdown
      const markdown = this.htmlToMarkdown(html);

      return { html, text, markdown };
    } catch (error) {
      console.warn(`[DOMParser] Error extracting response content:`, error);
      return { html: '', text: '', markdown: '' };
    }
  }

  /**
   * Extract inline and footnote citations
   */
  async extractCitations(): Promise<BrowserCitation[]> {
    const citations: BrowserCitation[] = [];

    try {
      // Get all citation links
      const citationLinks = await this.page.locator(this.selectors.citation_link).all();
      
      for (let i = 0; i < citationLinks.length; i++) {
        const link = citationLinks[i];
        
        try {
          const href = await link.getAttribute('href') || '';
          if (!href || !href.startsWith('http')) continue;

          const title = await link.innerText().catch(() => '');
          
          // Get surrounding context
          const parent = await link.evaluate((el) => {
            const p = el.closest('p, li, div');
            return p?.textContent || '';
          });

          // Check if it's inline or in a footer/source list
          const isInline = await link.evaluate((el) => {
            const container = el.closest('[class*="source"], [class*="citation-list"], [class*="footnote"]');
            return !container;
          });

          // Check for citation number
          const linkHandle = await link.elementHandle();
          const citationNumber = linkHandle ? await this.page.evaluate((el) => {
            const sup = el?.querySelector('sup');
            return sup ? parseInt(sup.textContent || '0') : 0;
          }, linkHandle) : 0;

          // Get domain badge if present
          const domainBadge = await link.evaluate((el) => {
            const badge = el.parentElement?.querySelector('[class*="badge"], [class*="verified"]');
            return badge?.textContent || undefined;
          });

          citations.push({
            index: citationNumber || i + 1,
            url: href,
            title: title.slice(0, 200),
            snippet: parent.slice(0, 300),
            position_in_text: i,
            surrounding_context: parent.slice(0, 500),
            is_inline: isInline,
            is_highlighted: false,
            citation_style: citationNumber ? 'numbered' : 'linked',
            domain_badge: domainBadge,
          });
        } catch (error) {
          console.warn(`[DOMParser] Error extracting citation ${i}:`, error);
        }
      }

      // Also check for numbered citations [1], [2], etc.
      const numberedCitations = await this.extractNumberedCitations();
      
      // Merge, avoiding duplicates
      for (const nc of numberedCitations) {
        if (!citations.find(c => c.url === nc.url)) {
          citations.push(nc);
        }
      }

    } catch (error) {
      console.warn(`[DOMParser] Error extracting citations:`, error);
    }

    return citations.sort((a, b) => a.index - b.index);
  }

  /**
   * Extract numbered citations like [1], [2] with their source URLs
   */
  private async extractNumberedCitations(): Promise<BrowserCitation[]> {
    const citations: BrowserCitation[] = [];

    try {
      // Look for superscript numbers or bracketed numbers
      const supElements = await this.page.locator('sup, [class*="citation-number"]').all();
      
      for (const sup of supElements) {
        const text = await sup.innerText().catch(() => '');
        const num = parseInt(text.replace(/[\[\]]/g, ''));
        
        if (isNaN(num)) continue;

        // Try to find the corresponding source in the source list
        const sourceUrl = await this.page.evaluate((index) => {
          // Look for source list
          const sources = document.querySelectorAll('[class*="source"] a, [class*="citation-list"] a');
          const source = sources[index - 1] as HTMLAnchorElement;
          return source?.href || '';
        }, num);

        if (sourceUrl) {
          const context = await sup.evaluate((el) => {
            const p = el.closest('p');
            return p?.textContent || '';
          });

          citations.push({
            index: num,
            url: sourceUrl,
            title: '',
            snippet: '',
            position_in_text: 0,
            surrounding_context: context.slice(0, 500),
            is_inline: true,
            is_highlighted: false,
            citation_style: 'superscript',
          });
        }
      }
    } catch (error) {
      console.warn(`[DOMParser] Error extracting numbered citations:`, error);
    }

    return citations;
  }

  /**
   * Extract search chips and related queries
   */
  async extractSearchChips(): Promise<SearchChip[]> {
    const chips: SearchChip[] = [];

    try {
      // Related queries / People also ask
      const chipElements = await this.page.locator(
        '[class*="related"], [class*="follow-up"], [class*="suggestion"], [class*="also-ask"]'
      ).all();

      for (let i = 0; i < chipElements.length; i++) {
        const element = chipElements[i];
        const text = await element.innerText().catch(() => '');
        
        if (text && text.length > 3 && text.length < 200) {
          // Determine chip type from class or context
          const className = await element.getAttribute('class') || '';
          let type: SearchChip['type'] = 'related_query';
          
          if (className.includes('follow-up') || className.includes('suggestion')) {
            type = 'follow_up';
          } else if (className.includes('also-ask') || className.includes('people-ask')) {
            type = 'people_also_ask';
          } else if (className.includes('filter')) {
            type = 'filter';
          } else if (className.includes('category')) {
            type = 'category';
          }

          // Check if expanded (for accordion-style)
          const isExpanded = await element.evaluate((el) => {
            return el.getAttribute('aria-expanded') === 'true' ||
                   el.classList.contains('expanded') ||
                   el.classList.contains('open');
          });

          chips.push({
            text: text.trim(),
            type,
            position: i,
            is_expanded: isExpanded,
          });
        }
      }
    } catch (error) {
      console.warn(`[DOMParser] Error extracting search chips:`, error);
    }

    return chips;
  }

  /**
   * Extract product tiles for shopping queries
   */
  async extractProductTiles(): Promise<ProductTile[]> {
    const tiles: ProductTile[] = [];

    try {
      const productElements = await this.page.locator(
        '[class*="product-card"], [class*="shopping"], [class*="product-tile"]'
      ).all();

      for (let i = 0; i < productElements.length; i++) {
        const element = productElements[i];
        
        const title = await element.locator('[class*="title"], h3, h4').first().innerText().catch(() => '');
        const price = await element.locator('[class*="price"]').first().innerText().catch(() => undefined);
        const ratingText = (await element.locator('[class*="rating"], [class*="stars"]').first().getAttribute('aria-label').catch(() => null)) || '';
        const rating = ratingText ? parseFloat(ratingText.match(/[\d.]+/)?.[0] || '0') : undefined;
        const reviewCountText = await element.locator('[class*="review-count"]').first().innerText().catch(() => '');
        const reviewCount = reviewCountText ? parseInt(reviewCountText.replace(/\D/g, '')) : undefined;
        const imageUrl = (await element.locator('img').first().getAttribute('src').catch(() => null)) || undefined;
        const sourceUrl = (await element.locator('a').first().getAttribute('href').catch(() => null)) || '';
        const merchant = (await element.locator('[class*="merchant"], [class*="seller"]').first().innerText().catch(() => null)) || undefined;
        
        const isSponsored = await element.evaluate((el) => {
          const text = el.textContent?.toLowerCase() || '';
          return text.includes('sponsored') || text.includes('ad') || el.classList.contains('sponsored');
        });

        if (title && sourceUrl) {
          tiles.push({
            title: title.slice(0, 200),
            price,
            rating,
            review_count: reviewCount,
            image_url: imageUrl,
            source_url: sourceUrl,
            merchant,
            is_sponsored: isSponsored,
            position: i,
          });
        }
      }
    } catch (error) {
      console.warn(`[DOMParser] Error extracting product tiles:`, error);
    }

    return tiles;
  }

  /**
   * Extract source cards (larger featured sources)
   */
  async extractSourceCards(): Promise<SourceCard[]> {
    const cards: SourceCard[] = [];

    try {
      const cardElements = await this.page.locator(this.selectors.source_card).all();

      for (const element of cardElements) {
        try {
          const title = await element.locator('h3, h4, [class*="title"]').first().innerText().catch(() => '');
          const url = await element.locator('a').first().getAttribute('href').catch(() => '') || '';
          const snippet = await element.locator('p, [class*="snippet"], [class*="description"]').first().innerText().catch(() => '');
          const imageUrl = (await element.locator('img').first().getAttribute('src').catch(() => null)) || undefined;
          const faviconUrl = (await element.locator('[class*="favicon"], img[width="16"]').first().getAttribute('src').catch(() => null)) || undefined;
          const publishDate = (await element.locator('[class*="date"], time').first().innerText().catch(() => null)) || undefined;
          const author = (await element.locator('[class*="author"]').first().innerText().catch(() => null)) || undefined;

          // Determine domain
          let domain = '';
          try {
            domain = url ? new URL(url).hostname.replace('www.', '') : '';
          } catch {}

          // Determine card type
          const className = await element.getAttribute('class') || '';
          let cardType: SourceCard['card_type'] = 'featured';
          if (className.includes('video') || url?.includes('youtube') || url?.includes('vimeo')) {
            cardType = 'video';
          } else if (className.includes('news') || className.includes('article')) {
            cardType = 'news';
          } else if (className.includes('social') || url?.includes('twitter') || url?.includes('reddit')) {
            cardType = 'social';
          } else if (className.includes('review')) {
            cardType = 'review';
          }

          if (title && url) {
            cards.push({
              title: title.slice(0, 200),
              url,
              snippet: snippet.slice(0, 500),
              image_url: imageUrl,
              favicon_url: faviconUrl,
              domain,
              publish_date: publishDate,
              author,
              card_type: cardType,
            });
          }
        } catch (error) {
          console.warn(`[DOMParser] Error extracting source card:`, error);
        }
      }
    } catch (error) {
      console.warn(`[DOMParser] Error extracting source cards:`, error);
    }

    return cards;
  }

  /**
   * Extract knowledge panel if present
   */
  async extractKnowledgePanel(): Promise<KnowledgePanel | null> {
    try {
      const panel = this.page.locator('[class*="knowledge-panel"], [class*="entity-card"], [class*="info-box"]').first();
      
      if (await panel.count() === 0) {
        return null;
      }

      const entityName = await panel.locator('h1, h2, [class*="name"]').first().innerText().catch(() => '');
      const entityType = await panel.locator('[class*="type"], [class*="category"]').first().innerText().catch(() => '');
      const description = await panel.locator('p, [class*="description"]').first().innerText().catch(() => '');
      const imageUrl = (await panel.locator('img').first().getAttribute('src').catch(() => null)) || undefined;

      // Extract attributes (key-value pairs)
      const attributes: Record<string, string> = {};
      const attributeRows = await panel.locator('[class*="attribute"], tr, [class*="fact"]').all();
      
      for (const row of attributeRows) {
        const key = await row.locator('[class*="label"], th, dt').first().innerText().catch(() => '');
        const value = await row.locator('[class*="value"], td, dd').first().innerText().catch(() => '');
        if (key && value) {
          attributes[key.trim()] = value.trim();
        }
      }

      // Extract social links
      const socialLinks: Array<{ platform: string; url: string }> = [];
      const socialElements = await panel.locator('a[href*="twitter"], a[href*="facebook"], a[href*="linkedin"], a[href*="instagram"]').all();
      
      for (const social of socialElements) {
        const url = await social.getAttribute('href') || '';
        let platform = 'other';
        if (url.includes('twitter') || url.includes('x.com')) platform = 'twitter';
        else if (url.includes('facebook')) platform = 'facebook';
        else if (url.includes('linkedin')) platform = 'linkedin';
        else if (url.includes('instagram')) platform = 'instagram';
        
        socialLinks.push({ platform, url });
      }

      // Official website
      const officialWebsite = (await panel.locator('a[class*="official"], a[rel="noopener"]').first().getAttribute('href').catch(() => null)) || undefined;

      if (entityName) {
        return {
          entity_name: entityName,
          entity_type: entityType || 'Unknown',
          description: description.slice(0, 1000),
          image_url: imageUrl,
          attributes,
          official_website: officialWebsite,
          social_links: socialLinks,
        };
      }
    } catch (error) {
      console.warn(`[DOMParser] Error extracting knowledge panel:`, error);
    }

    return null;
  }

  /**
   * Extract suggested follow-up questions
   */
  async extractSuggestedFollowups(): Promise<string[]> {
    const followups: string[] = [];

    try {
      const elements = await this.page.locator(
        '[class*="suggestion"], [class*="follow-up"], [class*="related-question"]'
      ).all();

      for (const element of elements) {
        const text = await element.innerText().catch(() => '');
        if (text && text.length > 5 && text.length < 200 && text.includes('?')) {
          followups.push(text.trim());
        }
      }
    } catch (error) {
      console.warn(`[DOMParser] Error extracting suggested followups:`, error);
    }

    return followups.slice(0, 10); // Limit to 10
  }

  /**
   * Capture full DOM snapshot for debugging
   */
  async captureDOMSnapshot(): Promise<DOMSnapshot> {
    try {
      const html = await this.page.content();
      const scrollPosition = await this.page.evaluate(() => window.scrollY);
      const pageHeight = await this.page.evaluate(() => document.body.scrollHeight);

      return {
        html: html.slice(0, 500000), // Limit size
        css_selectors_used: Object.values(this.selectors),
        elements_captured: await this.page.locator('*').count(),
        scroll_position: scrollPosition,
        page_height: pageHeight,
      };
    } catch (error) {
      console.warn(`[DOMParser] Error capturing DOM snapshot:`, error);
      return {
        html: '',
        css_selectors_used: [],
        elements_captured: 0,
        scroll_position: 0,
        page_height: 0,
      };
    }
  }

  /**
   * Convert HTML to Markdown (basic conversion)
   */
  private htmlToMarkdown(html: string): string {
    let markdown = html;

    // Remove script and style tags
    markdown = markdown.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    markdown = markdown.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Convert common elements
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n');
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n');
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n');
    markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n');
    markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
    markdown = markdown.replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
    markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
    markdown = markdown.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '```\n$1\n```');
    markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
    markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
    markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

    // Remove remaining HTML tags
    markdown = markdown.replace(/<[^>]+>/g, '');

    // Clean up whitespace
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    markdown = markdown.trim();

    return markdown;
  }
}

// ===========================================
// Factory Function
// ===========================================

export function createDOMParser(
  page: Page,
  engine: SupportedEngine,
  selectors: typeof ENGINE_SELECTORS[SupportedEngine]
): DOMParser {
  return new DOMParser(page, engine, selectors);
}

// ===========================================
// Utility: Wait for streaming to complete
// ===========================================

export async function waitForStreamingComplete(
  page: Page,
  selectors: typeof ENGINE_SELECTORS[SupportedEngine],
  timeout: number = 60000
): Promise<boolean> {
  const startTime = Date.now();

  try {
    // Wait for response container to appear
    await page.waitForSelector(selectors.response_container, { timeout: timeout / 2 });

    // Wait for streaming to stop
    while (Date.now() - startTime < timeout) {
      const isStreaming = await page.locator(selectors.streaming_indicator).count() > 0;
      
      if (!isStreaming) {
        // Additional wait to ensure content is fully loaded
        await page.waitForTimeout(500);
        
        // Double-check streaming is complete
        const stillStreaming = await page.locator(selectors.streaming_indicator).count() > 0;
        if (!stillStreaming) {
          return true;
        }
      }

      await page.waitForTimeout(200);
    }

    console.warn('[DOMParser] Timeout waiting for streaming to complete');
    return false;
  } catch (error) {
    console.error('[DOMParser] Error waiting for streaming:', error);
    return false;
  }
}

// ===========================================
// Utility: Human-like interactions
// ===========================================

export async function typeWithHumanDelay(
  locator: Locator,
  text: string,
  baseDelay: number = 50
): Promise<void> {
  for (const char of text) {
    await locator.type(char, { delay: baseDelay + Math.random() * 50 });
  }
}

export async function scrollToElement(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, selector);
  await page.waitForTimeout(300);
}

