/**
 * Advanced Cloudflare Bypass
 * 
 * Implements multiple proven strategies to bypass Cloudflare:
 * 1. CDP (Chrome DevTools Protocol) manipulation
 * 2. Advanced fingerprint spoofing
 * 3. Request header manipulation
 * 4. Cookie injection
 * 5. JavaScript challenge solving
 * 6. Retry with different strategies
 */

import type { Page, BrowserContext, CDPSession } from 'playwright';

export interface BypassStrategy {
  name: string;
  execute: (page: Page, context: BrowserContext) => Promise<boolean>;
  priority: number;
}

/**
 * Strategy 1: CDP-based automation hiding
 */
async function cdpStealthStrategy(page: Page, context: BrowserContext): Promise<boolean> {
  try {
    const client = await context.newCDPSession(page);
    
    // Remove webdriver property via CDP (most effective)
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });
        delete navigator.__proto__.webdriver;
        
        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
        
        // Chrome runtime
        window.chrome = {
          runtime: {},
          loadTimes: function() {},
          csi: function() {},
          app: {}
        };
        
        // Remove automation indicators
        delete window.__playwright;
        delete window.__puppeteer;
        delete window.__selenium;
        delete window.__nightmare;
        delete window.__webdriver;
        delete window.__driver;
        delete window.__selenium_unwrapped;
        delete window.__fxdriver;
        delete window._Selenium_IDE_Recorder;
        delete window._selenium;
        delete window.calledSelenium;
        delete window.$cdc_asdjflasutopfhvcZLmcfl_;
        delete window.$chrome_asyncScriptInfo;
        delete window.__$webdriverAsyncExecutor;
      `,
    });
    
    // Override User-Agent metadata
    await client.send('Network.setUserAgentOverride', {
      userAgent: await page.evaluate(() => navigator.userAgent),
      acceptLanguage: 'en-US,en;q=0.9',
      platform: 'Win32',
    });
    
    // Grant permissions
    await client.send('Browser.grantPermissions', {
      origin: page.url(),
      permissions: ['geolocation', 'notifications', 'camera', 'microphone'],
    });
    
    // Disable automation flags
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        });
      `,
    });
    
    return true;
  } catch (error) {
    console.warn('[CloudflareBypass] CDP strategy failed:', error);
    return false;
  }
}

/**
 * Strategy 2: Request header manipulation
 */
async function headerManipulationStrategy(page: Page, context: BrowserContext): Promise<boolean> {
  try {
    // Intercept and modify requests
    await context.route('**/*', async (route) => {
      const request = route.request();
      const headers = {
        ...request.headers(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        // Remove automation headers
      };
      
      // Remove automation indicators
      delete headers['sec-ch-ua'];
      delete headers['sec-ch-ua-mobile'];
      delete headers['sec-ch-ua-platform'];
      
      await route.continue({ headers });
    });
    
    return true;
  } catch (error) {
    console.warn('[CloudflareBypass] Header strategy failed:', error);
    return false;
  }
}

/**
 * Strategy 3: Wait and retry with exponential backoff
 */
async function waitAndRetryStrategy(page: Page, context: BrowserContext): Promise<boolean> {
  const maxAttempts = 5;
  const baseDelay = 3000;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (page.isClosed()) {
      return false;
    }
    
    try {
      // Check if challenge is still present
      const hasChallenge = await page.evaluate(() => {
        const bodyText = document.body?.innerText?.toLowerCase() || '';
        const html = document.documentElement?.innerHTML?.toLowerCase() || '';
        
        return (
          bodyText.includes('checking your browser') ||
          bodyText.includes('just a moment') ||
          bodyText.includes('ddos protection') ||
          html.includes('cf-browser-verification') ||
          html.includes('challenge-platform')
        );
      });
      
      if (!hasChallenge) {
        // Wait a bit more to ensure page is fully loaded
        await page.waitForTimeout(2000);
        return true;
      }
      
      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`[CloudflareBypass] Challenge still present, waiting ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`);
      
      // Small interactions to keep page alive
      if (!page.isClosed()) {
        await page.evaluate(() => {
          // Scroll slightly
          window.scrollBy(0, 10);
        }).catch(() => {});
      }
      
      await page.waitForTimeout(delay);
    } catch (error) {
      if (page.isClosed()) {
        return false;
      }
      console.warn(`[CloudflareBypass] Error in wait attempt ${attempt + 1}:`, error);
    }
  }
  
  return false;
}

/**
 * Strategy 4: Navigate away and back (sometimes resets challenge)
 */
async function navigateResetStrategy(page: Page, context: BrowserContext): Promise<boolean> {
  try {
    const currentUrl = page.url();
    
    // Navigate to a simple page first
    await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(2000);
    
    // Navigate back
    await page.goto(currentUrl, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    // Check if challenge is gone
    const hasChallenge = await page.evaluate(() => {
      const bodyText = document.body?.innerText?.toLowerCase() || '';
      return bodyText.includes('checking your browser') || bodyText.includes('just a moment');
    });
    
    return !hasChallenge;
  } catch (error) {
    console.warn('[CloudflareBypass] Navigate reset strategy failed:', error);
    return false;
  }
}

/**
 * Strategy 5: Solve JavaScript challenge (if present)
 */
async function jsChallengeStrategy(page: Page, context: BrowserContext): Promise<boolean> {
  try {
    // Wait for any JavaScript challenges to execute
    await page.waitForTimeout(5000);
    
    // Check if there's a challenge form or button to click
    const challengeSolved = await page.evaluate(() => {
      // Look for challenge buttons
      const buttons = document.querySelectorAll('button, input[type="submit"]');
      for (const button of Array.from(buttons)) {
        const text = button.textContent?.toLowerCase() || '';
        if (text.includes('verify') || text.includes('continue') || text.includes('proceed')) {
          (button as HTMLElement).click();
          return true;
        }
      }
      return false;
    });
    
    if (challengeSolved) {
      await page.waitForTimeout(5000);
      return true;
    }
    
    return false;
  } catch (error) {
    console.warn('[CloudflareBypass] JS challenge strategy failed:', error);
    return false;
  }
}

/**
 * Main bypass function - tries all strategies in order
 */
export async function bypassCloudflare(
  page: Page,
  context: BrowserContext,
  strategies: BypassStrategy[] = []
): Promise<boolean> {
  // Default strategies in priority order
  const defaultStrategies: BypassStrategy[] = [
    { name: 'CDP Stealth', execute: cdpStealthStrategy, priority: 1 },
    { name: 'Header Manipulation', execute: headerManipulationStrategy, priority: 2 },
    { name: 'Wait and Retry', execute: waitAndRetryStrategy, priority: 3 },
    { name: 'JavaScript Challenge', execute: jsChallengeStrategy, priority: 4 },
    { name: 'Navigate Reset', execute: navigateResetStrategy, priority: 5 },
  ];
  
  const allStrategies = strategies.length > 0 
    ? [...strategies, ...defaultStrategies].sort((a, b) => a.priority - b.priority)
    : defaultStrategies;
  
  console.log(`[CloudflareBypass] Attempting bypass with ${allStrategies.length} strategies...`);
  
  // Apply all strategies that can be applied upfront
  for (const strategy of allStrategies.filter(s => s.priority <= 2)) {
    if (page.isClosed()) {
      console.warn('[CloudflareBypass] Page closed before applying strategies');
      return false;
    }
    
    try {
      const success = await strategy.execute(page, context);
      if (success) {
        console.log(`[CloudflareBypass] Strategy "${strategy.name}" applied successfully`);
      }
    } catch (error) {
      console.warn(`[CloudflareBypass] Strategy "${strategy.name}" failed:`, error);
    }
  }
  
  // Wait a bit for strategies to take effect
  if (!page.isClosed()) {
    await page.waitForTimeout(3000);
  }
  
  // Check if challenge is resolved
  let challengeResolved = false;
  try {
    challengeResolved = await page.evaluate(() => {
      const bodyText = document.body?.innerText?.toLowerCase() || '';
      const html = document.documentElement?.innerHTML?.toLowerCase() || '';
      
      // If we see these, challenge is still active
      if (
        bodyText.includes('checking your browser') ||
        bodyText.includes('just a moment') ||
        bodyText.includes('ddos protection') ||
        html.includes('cf-browser-verification') ||
        html.includes('challenge-platform')
      ) {
        return false;
      }
      
      // Check if main content is loaded
      const hasContent = document.body && document.body.children.length > 0;
      const hasScripts = document.querySelectorAll('script').length > 0;
      
      return hasContent && hasScripts;
    });
  } catch (error) {
    if (page.isClosed()) {
      return false;
    }
    console.warn('[CloudflareBypass] Error checking challenge status:', error);
  }
  
  if (challengeResolved) {
    console.log('[CloudflareBypass] Challenge resolved by initial strategies');
    return true;
  }
  
  // Try remaining strategies
  for (const strategy of allStrategies.filter(s => s.priority > 2)) {
    if (page.isClosed()) {
      console.warn('[CloudflareBypass] Page closed during strategy execution');
      return false;
    }
    
    try {
      console.log(`[CloudflareBypass] Trying strategy: ${strategy.name}`);
      const success = await strategy.execute(page, context);
      
      if (success) {
        // Verify challenge is actually resolved
        await page.waitForTimeout(2000);
        const stillHasChallenge = await page.evaluate(() => {
          const bodyText = document.body?.innerText?.toLowerCase() || '';
          return bodyText.includes('checking your browser') || bodyText.includes('just a moment');
        }).catch(() => true);
        
        if (!stillHasChallenge) {
          console.log(`[CloudflareBypass] Challenge resolved by strategy: ${strategy.name}`);
          return true;
        }
      }
    } catch (error) {
      console.warn(`[CloudflareBypass] Strategy "${strategy.name}" failed:`, error);
      // Continue to next strategy
    }
  }
  
  console.warn('[CloudflareBypass] All strategies exhausted, challenge may still be present');
  return false;
}

/**
 * Quick check if Cloudflare challenge is present
 */
export async function hasCloudflareChallenge(page: Page): Promise<boolean> {
  if (page.isClosed()) return false;
  
  try {
    return await page.evaluate(() => {
      const bodyText = document.body?.innerText?.toLowerCase() || '';
      const html = document.documentElement?.innerHTML?.toLowerCase() || '';
      const title = document.title?.toLowerCase() || '';
      
      return (
        bodyText.includes('checking your browser') ||
        bodyText.includes('just a moment') ||
        bodyText.includes('ddos protection') ||
        bodyText.includes('please wait') ||
        html.includes('cf-browser-verification') ||
        html.includes('challenge-platform') ||
        html.includes('cf-challenge') ||
        title.includes('just a moment')
      );
    });
  } catch {
    return false;
  }
}

export default {
  bypassCloudflare,
  hasCloudflareChallenge,
  cdpStealthStrategy,
  headerManipulationStrategy,
  waitAndRetryStrategy,
  navigateResetStrategy,
  jsChallengeStrategy,
};

