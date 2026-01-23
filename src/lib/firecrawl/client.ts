/**
 * Firecrawl Client - Website Crawling Integration
 * 
 * Provides async website crawling to gather "Ground Truth" content
 * for enhanced AI visibility analysis.
 */

import FirecrawlApp from "@mendable/firecrawl-js";

// Initialize Firecrawl client
const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_API_KEY!,
});

export interface CrawlOptions {
  maxPages?: number;
  includePaths?: string[];
  excludePaths?: string[];
  maxDepth?: number;
  formats?: ("markdown" | "html" | "rawHtml" | "links" | "screenshot")[];
  timeout?: number; // In seconds
}

export interface CrawledPage {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
  html?: string;
  links?: string[];
  metadata?: Record<string, unknown>;
  crawledAt: string;
}

export interface CrawlResult {
  success: boolean;
  jobId?: string;
  status: "pending" | "crawling" | "completed" | "failed";
  pages: CrawledPage[];
  totalPages: number;
  errorMessage?: string;
  creditsUsed?: number;
}

export interface ScrapeResult {
  success: boolean;
  url: string;
  markdown?: string;
  html?: string;
  title?: string;
  description?: string;
  links?: string[];
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

const DEFAULT_CRAWL_OPTIONS: CrawlOptions = {
  maxPages: 50, // Match Firecrawl plan limits
  maxDepth: 3,
  formats: ["markdown"],
  timeout: 300, // 5 minutes
};

const TRANSIENT_FIRECRAWL_ERRORS = [
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
];

function isTransientFirecrawlError(message: string): boolean {
  return TRANSIENT_FIRECRAWL_ERRORS.some((code) => message.includes(code));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { maxAttempts?: number; baseDelayMs?: number }
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 500;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!isTransientFirecrawlError(message) || attempt >= maxAttempts) {
        throw error;
      }
      const delay = baseDelayMs * attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Scrape a single page - fast, synchronous
 */
export async function scrapePage(
  url: string,
  options?: { formats?: ("markdown" | "html" | "links")[] }
): Promise<ScrapeResult> {
  try {
    console.log(`[Firecrawl] Scraping page: ${url}`);
    
    const response = await firecrawl.scrapeUrl(url, {
      formats: options?.formats || ["markdown"],
    });

    if (!response.success) {
      return {
        success: false,
        url,
        errorMessage: response.error || "Failed to scrape page",
      };
    }

    return {
      success: true,
      url,
      markdown: response.markdown,
      html: response.html,
      title: response.metadata?.title as string | undefined,
      description: response.metadata?.description as string | undefined,
      links: response.links,
      metadata: response.metadata,
    };
  } catch (error) {
    console.error(`[Firecrawl] Scrape error for ${url}:`, error);
    return {
      success: false,
      url,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Start an async crawl job - returns immediately with a job ID
 * Use checkCrawlStatus to poll for completion
 */
export async function startCrawl(
  url: string,
  options: CrawlOptions = {}
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const mergedOptions = { ...DEFAULT_CRAWL_OPTIONS, ...options };
    console.log(`[Firecrawl] Starting crawl for: ${url} with options:`, mergedOptions);

    // Start async crawl - returns immediately
    const response = await withRetry(
      () =>
        firecrawl.asyncCrawlUrl(url, {
          limit: mergedOptions.maxPages,
          maxDepth: mergedOptions.maxDepth,
          includePaths: mergedOptions.includePaths,
          excludePaths: mergedOptions.excludePaths,
          scrapeOptions: {
            formats: mergedOptions.formats,
          },
        }),
      { maxAttempts: 3, baseDelayMs: 800 }
    );

    if (!response.success) {
      return {
        success: false,
        error: (response as { error?: string }).error || "Failed to start crawl",
      };
    }

    console.log(`[Firecrawl] Crawl started with job ID: ${response.id}`);
    
    return {
      success: true,
      jobId: response.id,
    };
  } catch (error) {
    console.error(`[Firecrawl] Start crawl error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check the status of an async crawl job
 */
export async function checkCrawlStatus(jobId: string): Promise<CrawlResult> {
  try {
    console.log(`[Firecrawl] Checking status for job: ${jobId}`);

    const response = await withRetry(
      () => firecrawl.checkCrawlStatus(jobId),
      { maxAttempts: 3, baseDelayMs: 800 }
    );

    // Check for error response
    if (!('status' in response)) {
      return {
        success: false,
        status: "failed",
        totalPages: 0,
        pages: [],
        errorMessage: 'error' in response ? String(response.error) : "Unknown error",
      };
    }

    // Map status
    let status: CrawlResult["status"] = "pending";
    if (response.status === "scraping") {
      status = "crawling";
    } else if (response.status === "completed") {
      status = "completed";
    } else if (response.status === "failed" || response.status === "cancelled") {
      status = "failed";
    }

    // Extract pages from response
    const pages: CrawledPage[] = (response.data || []).map((page: {
      url?: string;
      metadata?: { title?: string; description?: string };
      markdown?: string;
      html?: string;
      links?: string[];
    }) => ({
      url: page.url || "",
      title: page.metadata?.title,
      description: page.metadata?.description,
      markdown: page.markdown,
      html: page.html,
      links: page.links,
      metadata: page.metadata,
      crawledAt: new Date().toISOString(),
    }));

    return {
      success: status !== "failed",
      jobId,
      status,
      pages,
      totalPages: response.total || pages.length,
      creditsUsed: response.creditsUsed,
    };
  } catch (error) {
    console.error(`[Firecrawl] Check status error:`, error);
    const message = error instanceof Error ? error.message : String(error);
    if (isTransientFirecrawlError(message)) {
      return {
        success: false,
        jobId,
        status: "pending",
        pages: [],
        totalPages: 0,
        errorMessage: message,
      };
    }
    return {
      success: false,
      jobId,
      status: "failed",
      pages: [],
      totalPages: 0,
      errorMessage: message,
    };
  }
}

/**
 * Wait for a crawl to complete (polling with backoff)
 * Use this in background jobs, NOT in API routes
 */
export async function waitForCrawl(
  jobId: string,
  options?: { 
    maxWaitMs?: number; 
    pollIntervalMs?: number;
    maxPollIntervalMs?: number;
    onProgress?: (status: CrawlResult) => void;
  }
): Promise<CrawlResult> {
  const maxWait = options?.maxWaitMs || 300000; // 5 minutes default
  let pollInterval = options?.pollIntervalMs || 5000; // 5 seconds default
  const maxPollInterval = options?.maxPollIntervalMs || 20000; // 20 seconds max
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const status = await checkCrawlStatus(jobId);
    
    if (options?.onProgress) {
      options.onProgress(status);
    }

    if (status.status === "completed") {
      return status;
    }
    if (status.status === "failed") {
      const message = status.errorMessage || "";
      if (!isTransientFirecrawlError(message)) {
        return status;
      }
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    pollInterval = Math.min(maxPollInterval, Math.round(pollInterval * 1.5));
  }

  // Timeout
  return {
    success: false,
    jobId,
    status: "failed",
    pages: [],
    totalPages: 0,
    errorMessage: "Crawl timed out",
  };
}

/**
 * Extract key content from crawled pages for analysis
 */
export function extractGroundTruth(pages: CrawledPage[]): {
  combinedContent: string;
  pageCount: number;
  keyPages: { url: string; title: string; excerpt: string }[];
} {
  const keyPages: { url: string; title: string; excerpt: string }[] = [];
  const contentParts: string[] = [];

  for (const page of pages) {
    if (!page.markdown) continue;

    // Get first 500 chars as excerpt
    const excerpt = page.markdown.slice(0, 500).trim();
    
    keyPages.push({
      url: page.url,
      title: page.title || page.url,
      excerpt,
    });

    // Add to combined content (limit per page to avoid token explosion)
    const limitedContent = page.markdown.slice(0, 3000);
    contentParts.push(`## ${page.title || page.url}\nURL: ${page.url}\n\n${limitedContent}`);
  }

  return {
    combinedContent: contentParts.join("\n\n---\n\n"),
    pageCount: pages.length,
    keyPages,
  };
}

/**
 * Fetch robots.txt from a domain
 * This is critical for detecting AI crawler blocks
 */
export async function fetchRobotsTxt(domain: string): Promise<string | null> {
  try {
    // Normalize domain
    let url = domain;
    if (!url.startsWith('http')) {
      url = `https://${url}`;
    }
    const robotsUrl = new URL('/robots.txt', url).toString();
    
    console.log(`[Firecrawl] Fetching robots.txt from: ${robotsUrl}`);
    
    const response = await fetch(robotsUrl, {
      headers: {
        'User-Agent': 'EllipseSearch/1.0 (AI Visibility Analyzer)',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });
    
    if (!response.ok) {
      console.log(`[Firecrawl] robots.txt not found or inaccessible: ${response.status}`);
      return null;
    }
    
    const content = await response.text();
    console.log(`[Firecrawl] robots.txt fetched: ${content.length} bytes`);
    return content;
  } catch (error) {
    console.error(`[Firecrawl] Error fetching robots.txt:`, error);
    return null;
  }
}

export { firecrawl };


