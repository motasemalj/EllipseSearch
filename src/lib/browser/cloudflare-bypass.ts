/**
 * Cloudflare Bypass
 * 
 * Advanced techniques to bypass Cloudflare bot detection:
 * - Wait for Cloudflare challenges to complete
 * - Handle "Just a moment" pages
 * - Bypass Turnstile challenges
 * - Handle 403/429 responses
 */

import type { Page, Response } from 'playwright';

export interface CloudflareBypassOptions {
  maxWaitTime: number; // Max time to wait for challenge (ms)
  checkInterval: number; // How often to check (ms)
  retryOnFailure: boolean;
  maxRetries: number;
}

const DEFAULT_OPTIONS: CloudflareBypassOptions = {
  maxWaitTime: 60000, // 60 seconds
  checkInterval: 1000, // Check every second
  retryOnFailure: true,
  maxRetries: 3,
};

/**
 * Wait for Cloudflare challenge to complete
 */
export async function waitForCloudflareChallenge(
  page: Page,
  options: Partial<CloudflareBypassOptions> = {}
): Promise<boolean> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();

  console.log('[CloudflareBypass] Waiting for challenge to complete...');
  
  // Keep-alive mechanism: periodically interact with page to prevent timeout
  let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  
  try {
    keepAliveInterval = setInterval(() => {
      if (page.isClosed()) {
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        return;
      }
      
      // Small interaction to keep page alive
      try {
        page.evaluate(() => {
          // Just access document to keep connection alive
          return document.readyState;
        }).catch(() => {
          // Ignore errors
        });
      } catch {
        // Ignore
      }
    }, 5000); // Every 5 seconds

    while (Date.now() - startTime < opts.maxWaitTime) {
      // Check if page is closed BEFORE any operations
      if (page.isClosed()) {
        console.warn('[CloudflareBypass] Page closed during challenge');
        break;
      }

      try {
        // Check if challenge is complete (with error handling)
        let challengeComplete = false;
        try {
          challengeComplete = await page.evaluate(() => {
            // Check for Cloudflare challenge indicators
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
        } catch {
          // If evaluation fails, page might be closed or navigating
          if (page.isClosed()) {
            console.warn('[CloudflareBypass] Page closed during evaluation');
            break;
          }
          // Otherwise, continue waiting
          challengeComplete = false;
        }

        if (challengeComplete) {
          console.log('[CloudflareBypass] Challenge completed');
          // Wait a bit more for page to fully load (only if page is still open)
          if (!page.isClosed()) {
            try {
              await page.waitForTimeout(2000);
            } catch {
              // Ignore timeout errors if page closes
            }
          }
          if (keepAliveInterval) clearInterval(keepAliveInterval);
          return true;
        }

        // Wait before checking again (with safety check)
        if (!page.isClosed()) {
          try {
            // Use shorter intervals and check more frequently
            await Promise.race([
              page.waitForTimeout(opts.checkInterval),
              new Promise((resolve) => {
                // Check every 100ms if page is still open
                const checkInterval = setInterval(() => {
                  if (page.isClosed()) {
                    clearInterval(checkInterval);
                    resolve(true);
                  }
                }, 100);
                setTimeout(() => {
                  clearInterval(checkInterval);
                  resolve(false);
                }, opts.checkInterval);
              }),
            ]);
          } catch {
            // If page closes during wait, exit
            if (page.isClosed()) {
              console.warn('[CloudflareBypass] Page closed during wait');
              break;
            }
          }
        } else {
          break;
        }
      } catch (error) {
        // Check if page is closed
        if (page.isClosed()) {
          console.warn('[CloudflareBypass] Page closed, stopping challenge wait');
          break;
        }
        
        // Log error but continue (might be transient)
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (!errorMsg.includes('Target page, context or browser has been closed')) {
          console.warn('[CloudflareBypass] Error checking challenge:', errorMsg);
        }
        
        // Small delay before retry
        if (!page.isClosed()) {
          try {
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch {
            // Ignore if page closes
          }
        } else {
          break;
        }
      }
    }
  } finally {
      // Clean up keep-alive interval
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
    }

  console.warn('[CloudflareBypass] Challenge timeout - page may still be protected');
  return false;
}

/**
 * Check if page is showing Cloudflare challenge
 */
export async function isCloudflareChallenge(page: Page): Promise<boolean> {
  if (page.isClosed()) return false;

  try {
    return await page.evaluate(() => {
      if (!document.body && !document.documentElement) return false;
      
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
  } catch (error) {
    // If page closes or error occurs, assume no challenge
    if (page.isClosed()) return false;
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('Target page, context or browser has been closed')) {
      return false;
    }
    return false;
  }
}

/**
 * Handle Cloudflare challenge with retries
 */
export async function handleCloudflareChallenge(
  page: Page,
  options: Partial<CloudflareBypassOptions> = {}
): Promise<boolean> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let retries = 0;

  while (retries < opts.maxRetries) {
    // Check if page is closed before proceeding
    if (page.isClosed()) {
      console.warn('[CloudflareBypass] Page closed before challenge check');
      return false;
    }

    let isChallenge = false;
    try {
      isChallenge = await isCloudflareChallenge(page);
    } catch (error) {
      if (page.isClosed()) {
        return false;
      }
      console.warn('[CloudflareBypass] Error checking for challenge:', error);
      isChallenge = false;
    }
    
    if (!isChallenge) {
      console.log('[CloudflareBypass] No challenge detected');
      return true;
    }

    console.log(`[CloudflareBypass] Challenge detected, attempt ${retries + 1}/${opts.maxRetries}`);

    const completed = await waitForCloudflareChallenge(page, opts);
    
    if (completed && !page.isClosed()) {
      // Double-check challenge is gone
      try {
        const stillChallenge = await isCloudflareChallenge(page);
        if (!stillChallenge) {
          return true;
        }
      } catch (error) {
        console.warn('[CloudflareBypass] Error verifying challenge state:', error);
        // If we can't check, assume challenge is resolved if page is still open
        if (!page.isClosed()) {
          return true;
        }
        return false;
      }
    }

    retries++;
    
    if (retries < opts.maxRetries && !page.isClosed()) {
      console.log(`[CloudflareBypass] Retrying... (${retries}/${opts.maxRetries})`);
      try {
        await page.waitForTimeout(3000);
      } catch {
        // Page might have closed
        if (page.isClosed()) {
          return false;
        }
      }
    }
  }

  return false;
}

/**
 * Intercept and handle Cloudflare responses
 */
export function setupCloudflareInterception(page: Page): void {
  // Listen for responses that might be Cloudflare challenges
  page.on('response', async (response: Response) => {
    const status = response.status();
    const url = response.url();

    // Check for Cloudflare challenge responses
    if (status === 403 || status === 429) {
      const headers = response.headers();
      if (
        headers['cf-ray'] ||
        headers['server']?.includes('cloudflare') ||
        url.includes('challenges.cloudflare.com')
      ) {
        console.warn(`[CloudflareBypass] Detected Cloudflare response: ${status} for ${url}`);
      }
    }
  });

  // Listen for navigation that might trigger challenges
  page.on('framenavigated', async (frame) => {
    if (frame === page.mainFrame()) {
      const url = frame.url();
      if (url.includes('challenges.cloudflare.com') || url.includes('cf-browser-verification')) {
        console.warn('[CloudflareBypass] Navigated to Cloudflare challenge page');
      }
    }
  });
}

const cloudflareBypass = {
  waitForCloudflareChallenge,
  isCloudflareChallenge,
  handleCloudflareChallenge,
  setupCloudflareInterception,
};

export default cloudflareBypass;

