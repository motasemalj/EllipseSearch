/**
 * Job: crawl-brand-website
 * 
 * Asynchronously crawls a brand's website using Firecrawl to gather
 * "Ground Truth" content for enhanced AI visibility analysis.
 * 
 * Features:
 * - Concurrency control (max 50 concurrent jobs to match Firecrawl limits)
 * - Async polling for crawl status
 * - Stores crawled content in database
 * - Updates brand with ground truth summary
 */

import { task } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { 
  startCrawl, 
  waitForCrawl, 
  extractGroundTruth,
  fetchRobotsTxt,
  type CrawlResult 
} from "@/lib/firecrawl/client";
import { extractGroundTruthData } from "@/lib/ai/hallucination-detector";
import { analyzeCrawledContent, type CrawlAnalysis } from "@/lib/ai/crawl-analyzer";
import type { CrawlBrandInput } from "@/types";

// Create Supabase client with service role for job access
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const crawlBrandWebsite = task({
  id: "crawl-brand-website",
  
  // Concurrency control - max 50 concurrent crawl jobs to match Firecrawl plan limits
  queue: {
    name: "firecrawl-queue",
    concurrencyLimit: 50,
  },
  
  // Long running - crawls can take several minutes
  maxDuration: 600, // 10 minutes max
  
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
  },

  run: async (payload: CrawlBrandInput) => {
    const { brand_id, crawl_job_id, start_url, max_pages = 50, max_depth = 3 } = payload;
    const supabase = getSupabase();

    console.log(`[Crawl] Starting crawl for brand ${brand_id}, URL: ${start_url}`);

    // Fetch brand info for analysis
    const { data: brand } = await supabase
      .from("brands")
      .select("name, domain")
      .eq("id", brand_id)
      .single();
    
    const brandName = brand?.name || "";
    const brandDomain = brand?.domain || new URL(start_url).hostname;

    // 1. Update crawl job status to "crawling"
    await supabase
      .from("crawl_jobs")
      .update({ 
        status: "crawling",
        started_at: new Date().toISOString(),
      })
      .eq("id", crawl_job_id);

    try {
      // 2. Start the async crawl with Firecrawl
      const startResult = await startCrawl(start_url, {
        maxPages: max_pages,
        maxDepth: max_depth,
        includePaths: payload.include_paths,
        excludePaths: payload.exclude_paths,
        formats: ["markdown"],
      });

      if (!startResult.success || !startResult.jobId) {
        throw new Error(startResult.error || "Failed to start crawl");
      }

      const firecrawlJobId = startResult.jobId;
      console.log(`[Crawl] Firecrawl job started: ${firecrawlJobId}`);

      // 3. Update crawl job with Firecrawl job ID
      await supabase
        .from("crawl_jobs")
        .update({ firecrawl_job_id: firecrawlJobId })
        .eq("id", crawl_job_id);

      // 4. Wait for crawl to complete (polls every 5 seconds)
      let lastProgressUpdate = 0;
      const crawlResult = await waitForCrawl(firecrawlJobId, {
        maxWaitMs: 300000, // 5 minutes
        pollIntervalMs: 5000, // 5 seconds
        onProgress: async (status: CrawlResult) => {
          // Update progress in database every 10 pages
          if (status.pages.length > lastProgressUpdate + 10) {
            lastProgressUpdate = status.pages.length;
            await supabase
              .from("crawl_jobs")
              .update({ total_pages_crawled: status.pages.length })
              .eq("id", crawl_job_id);
            console.log(`[Crawl] Progress: ${status.pages.length} pages crawled`);
          }
        },
      });

      if (!crawlResult.success || crawlResult.status === "failed") {
        throw new Error(crawlResult.errorMessage || "Crawl failed");
      }

      console.log(`[Crawl] Completed: ${crawlResult.pages.length} pages crawled`);

      // 5. Store crawled pages in database
      const pagesToInsert = crawlResult.pages.map(page => ({
        crawl_job_id,
        brand_id,
        url: page.url,
        title: page.title || null,
        description: page.description || null,
        content_markdown: page.markdown || null,
        content_excerpt: page.markdown?.slice(0, 500) || null,
        word_count: page.markdown?.split(/\s+/).length || 0,
        links_count: page.links?.length || 0,
        crawled_at: page.crawledAt,
      }));

      if (pagesToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("crawled_pages")
          .insert(pagesToInsert);

        if (insertError) {
          console.error("[Crawl] Error inserting pages:", insertError);
        }
      }

      // 6. Extract ground truth summary (basic)
      const groundTruth = extractGroundTruth(crawlResult.pages);

      // 7. Fetch robots.txt for AI crawler analysis
      console.log(`[Crawl] Fetching robots.txt for crawler access analysis...`);
      const robotsTxtContent = await fetchRobotsTxt(brandDomain);

      // 8. Run FULL CRAWL ANALYSIS for actionable recommendations
      console.log(`[Crawl] Running comprehensive crawl analysis...`);
      const crawlAnalysis: CrawlAnalysis = await analyzeCrawledContent(
        crawlResult.pages,
        brandName,
        brandDomain,
        robotsTxtContent || undefined
      );
      
      console.log(`[Crawl] Analysis complete:`);
      console.log(`  - Critical issues: ${crawlAnalysis.summary.critical_issues.length}`);
      console.log(`  - High priority issues: ${crawlAnalysis.summary.high_priority_issues.length}`);
      console.log(`  - Medium priority issues: ${crawlAnalysis.summary.medium_priority_issues.length}`);
      console.log(`  - Schema types found: ${crawlAnalysis.schema_markup.schema_types_found.join(', ') || 'None'}`);
      console.log(`  - Blocks AI crawlers: GPTBot=${crawlAnalysis.crawler_access.blocks_gptbot}, Gemini=${crawlAnalysis.crawler_access.blocks_google_extended}`);

      // 9. Extract STRUCTURED ground truth data for hallucination detection
      console.log(`[Crawl] Extracting structured ground truth data...`);
      const structuredGroundTruth = await extractGroundTruthData(
        crawlResult.pages.map(p => ({
          url: p.url,
          title: p.title || p.url,
          markdown: p.markdown || "",
        }))
      );
      console.log(`[Crawl] Extracted: ${structuredGroundTruth.pricing?.length || 0} pricing plans, ${structuredGroundTruth.features?.length || 0} features`);

      // 10. Update brand with comprehensive ground truth summary INCLUDING crawl analysis
      const groundTruthSummary = {
        total_pages: crawlResult.pages.length,
        key_pages: groundTruth.keyPages.slice(0, 10),
        crawl_job_id,
        crawled_at: new Date().toISOString(),
        // Structured data for hallucination detection
        structured_data: {
          pricing: structuredGroundTruth.pricing,
          features: structuredGroundTruth.features,
          products: structuredGroundTruth.products,
          services: structuredGroundTruth.services,
          company_description: structuredGroundTruth.company_description,
          tagline: structuredGroundTruth.tagline,
          locations: structuredGroundTruth.locations,
        },
        // CRAWL ANALYSIS for actionable recommendations
        crawl_analysis: crawlAnalysis,
      };

      await supabase
        .from("brands")
        .update({
          ground_truth_summary: groundTruthSummary,
          last_crawled_at: new Date().toISOString(),
        })
        .eq("id", brand_id);

      // 8. Mark crawl job as completed
      await supabase
        .from("crawl_jobs")
        .update({
          status: "completed",
          total_pages_crawled: crawlResult.pages.length,
          credits_used: crawlResult.creditsUsed || 0,
          completed_at: new Date().toISOString(),
        })
        .eq("id", crawl_job_id);

      console.log(`[Crawl] ✓ Brand ${brand_id} crawl completed. ${crawlResult.pages.length} pages stored.`);

      return {
        success: true,
        crawl_job_id,
        pages_crawled: crawlResult.pages.length,
        credits_used: crawlResult.creditsUsed,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Crawl] ✗ Error crawling brand ${brand_id}:`, errorMsg);

      // Update crawl job as failed
      await supabase
        .from("crawl_jobs")
        .update({
          status: "failed",
          error_message: errorMsg,
          completed_at: new Date().toISOString(),
        })
        .eq("id", crawl_job_id);

      throw error;
    }
  },
});

