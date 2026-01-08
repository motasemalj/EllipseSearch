/**
 * Job: run-prompt-analysis
 * 
 * Orchestrates a multi-prompt, multi-engine analysis run.
 * 
 * FLOW:
 * 1. CRAWL the brand website FIRST (if not recently crawled)
 * 2. Wait for crawl to complete
 * 3. Run simulations - all recommendations based on crawl data
 * 
 * Supports both prompt sets AND individual prompts.
 * Processes simulations sequentially to avoid rate limits.
 */

import { task } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import type { SupportedEngine, RunAnalysisInput } from "@/types";
import { 
  startCrawl, 
  waitForCrawl, 
  fetchRobotsTxt,
  extractGroundTruth,
} from "@/lib/firecrawl/client";
import { analyzeCrawledContent } from "@/lib/ai/crawl-analyzer";
import { extractGroundTruthData } from "@/lib/ai/hallucination-detector";

// Create Supabase client with service role for job access
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// How old can crawl data be before we re-crawl (in hours)
const CRAWL_FRESHNESS_HOURS = 24;

// Alias for backwards compatibility
export const runKeywordSetAnalysis = task({
  id: "run-keyword-set-analysis",
  maxDuration: 900, // 15 minutes max

  run: async (payload: RunAnalysisInput) => {
    // Support both prompt_set_id (new) and keyword_set_id (legacy)
    const prompt_set_id = payload.prompt_set_id;
    const prompt_ids = payload.prompt_ids;
    const { brand_id, engines, language, region = "global", enable_hallucination_watchdog } = payload;
    const supabase = getSupabase();

    console.log(`Starting analysis for brand ${brand_id}${prompt_set_id ? `, prompt set ${prompt_set_id}` : ''}, ${prompt_ids?.length || 'all'} prompts`);

    // 1. Fetch prompts - either from a set or by specific IDs
    let prompts: { id: string; text: string }[] = [];
    
    if (prompt_ids && prompt_ids.length > 0) {
      // Run on specific prompts (no set required)
      const { data, error } = await supabase
        .from("prompts")
        .select("id, text")
        .in("id", prompt_ids);
      
      if (error || !data) {
        throw new Error(`Failed to fetch prompts: ${error?.message}`);
      }
      prompts = data;
    } else if (prompt_set_id) {
      // Run on all prompts in a set
      const { data, error } = await supabase
        .from("prompts")
        .select("id, text")
        .eq("prompt_set_id", prompt_set_id);
      
      if (error || !data) {
        throw new Error(`Failed to fetch prompts from set: ${error?.message}`);
      }
      prompts = data;
    } else {
      throw new Error("Either prompt_set_id or prompt_ids must be provided");
    }

    if (prompts.length === 0) {
      throw new Error("No prompts found to analyze");
    }

    const totalSimulations = prompts.length * engines.length;

    // 2. Find or create the batch
    let batchId: string;
    
    // Check for existing processing batch
    const batchQuery = supabase
      .from("analysis_batches")
      .select("*")
      .eq("brand_id", brand_id)
      .eq("status", "processing")
      .order("created_at", { ascending: false })
      .limit(1);
    
    if (prompt_set_id) {
      batchQuery.eq("prompt_set_id", prompt_set_id);
    }

    const { data: existingBatch } = await batchQuery.single();

    if (existingBatch?.id) {
      batchId = existingBatch.id;
    } else {
      // Create new batch
      const { data: newBatch, error: batchError } = await supabase
        .from("analysis_batches")
        .insert({
          brand_id,
          prompt_set_id: prompt_set_id || null,
          status: "processing",
          engines,
          language,
          region,
          total_simulations: totalSimulations,
          completed_simulations: 0,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (batchError || !newBatch) {
        throw new Error(`Failed to create batch: ${batchError?.message}`);
      }
      batchId = newBatch.id;
    }

    // 3. Fetch brand
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("*, organizations(*)")
      .eq("id", brand_id)
      .single();

    if (brandError || !brand) {
      await supabase
        .from("analysis_batches")
        .update({ status: "failed", error_message: `Brand not found: ${brand_id}` })
        .eq("id", batchId);
      throw new Error(`Brand not found: ${brand_id}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. CRAWL BRAND WEBSITE FIRST (REQUIRED for actionable recs)
    // ═══════════════════════════════════════════════════════════════
    // Actionable Recommendations are ONLY generated from crawl data.
    // If no crawl data exists, we MUST crawl first.
    // ═══════════════════════════════════════════════════════════════
    
    const needsCrawl = !brand.last_crawled_at || 
      (Date.now() - new Date(brand.last_crawled_at).getTime()) > CRAWL_FRESHNESS_HOURS * 60 * 60 * 1000;
    
    let crawlSuccessful = !needsCrawl; // If we don't need to crawl, existing data is valid
    
    if (needsCrawl) {
      console.log(`🕷️ CRAWLING ${brand.domain} - Required for Actionable Recommendations`);
      console.log(`   Without crawl data, only generic Suggestions will be available`);
      
      await supabase
        .from("analysis_batches")
        .update({ error_message: "Crawling website for actionable recommendations..." })
        .eq("id", batchId);
      
      // Ensure domain has protocol
      let startUrl = brand.domain;
      if (!startUrl.startsWith('http')) {
        startUrl = `https://${startUrl}`;
      }
      
      // Retry crawl up to 2 times
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`🕷️ Crawl attempt ${attempt}/2...`);
          
          // Start crawl
          const crawlStart = await startCrawl(startUrl, {
            maxPages: 30,
            maxDepth: 2,
            formats: ["markdown", "html"],
          });
          
          if (!crawlStart.success || !crawlStart.jobId) {
            console.warn(`⚠️ Attempt ${attempt}: Crawl failed to start: ${crawlStart.error}`);
            continue;
          }
          
          console.log(`🕷️ Crawl job started: ${crawlStart.jobId}`);
          
          // Wait for crawl to complete
          const crawlResult = await waitForCrawl(crawlStart.jobId, {
            maxWaitMs: 180000, // 3 minutes max
            pollIntervalMs: 5000,
            onProgress: (status) => {
              console.log(`🕷️ Crawl progress: ${status.pages.length} pages...`);
            },
          });
          
          if (!crawlResult.success || crawlResult.pages.length === 0) {
            console.warn(`⚠️ Attempt ${attempt}: Crawl returned 0 pages`);
            continue;
          }
          
          // SUCCESS - Process crawl data
          console.log(`✓ Crawl SUCCESS: ${crawlResult.pages.length} pages`);
          
          // Normalize page URLs (ensure they have protocol)
          const normalizedPages = crawlResult.pages.map(page => ({
            ...page,
            url: page.url?.startsWith('http') ? page.url : `https://${brand.domain}${page.url?.startsWith('/') ? '' : '/'}${page.url || ''}`,
          })).filter(page => page.url && page.url.length > 0);
          
          console.log(`📄 Normalized ${normalizedPages.length} pages`);
          
          // Fetch robots.txt (separate try-catch so it doesn't fail the whole process)
          let robotsTxt: string | null = null;
          try {
            robotsTxt = await fetchRobotsTxt(brand.domain);
          } catch (robotsError) {
            console.warn(`⚠️ Could not fetch robots.txt: ${robotsError}`);
          }
          
          // Run full analysis on crawled content
          console.log(`📊 Analyzing crawled content for actionable recommendations...`);
          let crawlAnalysis;
          try {
            crawlAnalysis = await analyzeCrawledContent(
              normalizedPages,
              brand.name,
              brand.domain,
              robotsTxt || undefined
            );
          } catch (analysisError) {
            console.error(`❌ Analysis error: ${analysisError}`);
            // Create a minimal analysis so we can continue
            crawlAnalysis = {
              crawler_access: { robots_txt_found: false, blocks_gptbot: false, blocks_google_extended: false, blocks_claudebot: false, blocks_all_bots: false, blocking_lines: [] },
              schema_markup: { has_schema: false, schema_types_found: [], missing_critical_schemas: ['Organization'], schema_issues: [] },
              brand_entity: { homepage_h1_vague: false, homepage_h1_issues: [], meta_description_length: 0, brand_name_in_title: false, brand_name_in_h1: false, brand_name_in_meta: false },
              content_structure: { has_pricing_page: false, pricing_in_top_20_percent: false, has_faq_page: false, has_about_page: false, average_heading_structure_score: 3, pages_missing_h1: 0 },
              authority_signals: { has_press_page: false, has_media_mentions: false, media_mention_count: 0, has_testimonials_page: false, testimonial_count: 0, has_case_studies: false, case_study_count: 0, has_awards_section: false, awards_mentioned: [], has_client_logos: false },
              freshness: { pages_older_than_6_months: 0, pages_older_than_12_months: 0, stale_critical_pages: [] },
              summary: { total_pages_analyzed: normalizedPages.length, critical_issues: [], high_priority_issues: [], medium_priority_issues: [] },
            };
          }
          
          console.log(`📊 Crawl Analysis Complete:`);
          console.log(`   🔴 Critical issues: ${crawlAnalysis.summary.critical_issues.length}`);
          console.log(`   🟠 High priority: ${crawlAnalysis.summary.high_priority_issues.length}`);
          console.log(`   🟡 Medium priority: ${crawlAnalysis.summary.medium_priority_issues.length}`);
          
          // Extract structured ground truth for hallucination detection
          let structuredGroundTruth;
          try {
            structuredGroundTruth = await extractGroundTruthData(
              normalizedPages.map(p => ({
                url: p.url,
                title: p.title || p.url,
                markdown: p.markdown || "",
              }))
            );
          } catch (extractError) {
            console.warn(`⚠️ Could not extract structured ground truth: ${extractError}`);
            structuredGroundTruth = {};
          }
          
          // Extract basic ground truth
          const groundTruth = extractGroundTruth(normalizedPages);
          
          // Store crawled pages
          const pagesToInsert = normalizedPages.map(page => ({
            crawl_job_id: null,
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
          
          // Delete old crawled pages for this brand
          await supabase
            .from("crawled_pages")
            .delete()
            .eq("brand_id", brand_id);
          
          // Insert new pages
          if (pagesToInsert.length > 0) {
            await supabase.from("crawled_pages").insert(pagesToInsert);
          }
          
          // Update brand with comprehensive ground truth INCLUDING crawl analysis
          const groundTruthSummary = {
            total_pages: normalizedPages.length,
            key_pages: groundTruth.keyPages.slice(0, 10),
            crawled_at: new Date().toISOString(),
            structured_data: {
              pricing: structuredGroundTruth.pricing,
              features: structuredGroundTruth.features,
              products: structuredGroundTruth.products,
              services: structuredGroundTruth.services,
              company_description: structuredGroundTruth.company_description,
              tagline: structuredGroundTruth.tagline,
              locations: structuredGroundTruth.locations,
            },
            // THE KEY: Full crawl analysis for Actionable Recommendations
            crawl_analysis: crawlAnalysis,
          };
          
          await supabase
            .from("brands")
            .update({
              ground_truth_summary: groundTruthSummary,
              last_crawled_at: new Date().toISOString(),
            })
            .eq("id", brand_id);
          
          console.log(`✓ Ground truth saved for ${brand.name}`);
          crawlSuccessful = true;
          break; // Exit retry loop on success
          
        } catch (crawlError) {
          console.warn(`⚠️ Attempt ${attempt}: Error: ${crawlError}`);
          if (attempt === 2) {
            console.error(`❌ All attempts failed. Actionable Recommendations will be EMPTY.`);
          }
        }
      }
      
      await supabase
        .from("analysis_batches")
        .update({ error_message: crawlSuccessful ? null : "Crawl failed - only suggestions available" })
        .eq("id", batchId);
        
    } else {
      console.log(`✓ Using existing crawl data from ${brand.last_crawled_at}`);
    }
    
    if (!crawlSuccessful) {
      console.log(`\n═══════════════════════════════════════════════════════════`);
      console.log(`⚠️ WARNING: No crawl data available`);
      console.log(`   - "Actionable Recommendations" section will be EMPTY`);
      console.log(`   - Only "Suggested Recommendations" (generic) will be shown`);
      console.log(`═══════════════════════════════════════════════════════════\n`);
    }

    console.log(`Processing ${prompts.length} prompts x ${engines.length} engines = ${totalSimulations} simulations`);

    // 4. Import and run the check-prompt-visibility task
    const { checkPromptVisibility } = await import("./check-prompt-visibility");
    
    let completedCount = 0;
    const errors: string[] = [];

    // 5. Process each prompt/engine combination
    for (const prompt of prompts) {
      for (const engine of engines as SupportedEngine[]) {
        try {
          console.log(`Processing: "${prompt.text}" on ${engine}`);

          // Trigger and WAIT for the child task to complete
          const result = await checkPromptVisibility.triggerAndWait({
            brand_id,
            prompt_id: prompt.id,
            keyword_id: prompt.id, // For backwards compatibility
            analysis_batch_id: batchId,
            engine,
            language,
            region,
            enable_hallucination_watchdog,
          });

          if (result.ok) {
            completedCount++;
            console.log(`✓ Completed: "${prompt.text}" on ${engine} - visible: ${result.output?.is_visible}`);
          } else {
            errors.push(`${prompt.text} (${engine}): ${result.error}`);
            console.error(`✗ Failed: "${prompt.text}" on ${engine}:`, result.error);
          }

          // Update batch progress
          await supabase
            .from("analysis_batches")
            .update({ completed_simulations: completedCount })
            .eq("id", batchId);

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`${prompt.text} (${engine}): ${errorMsg}`);
          console.error(`✗ Error: "${prompt.text}" on ${engine}:`, error);
          completedCount++; // Count as completed (failed) for progress
        }
      }
    }

    // 6. Mark batch as complete
    const finalStatus = errors.length === totalSimulations ? "failed" : "completed";
    
    await supabase
      .from("analysis_batches")
      .update({
        status: finalStatus,
        completed_simulations: completedCount,
        completed_at: new Date().toISOString(),
        error_message: errors.length > 0 ? `${errors.length} errors: ${errors.slice(0, 3).join("; ")}` : null,
      })
      .eq("id", batchId);

    console.log(`Batch ${batchId} completed. Status: ${finalStatus}, Completed: ${completedCount}/${totalSimulations}`);

    return {
      batch_id: batchId,
      total_simulations: totalSimulations,
      completed: completedCount,
      errors: errors.length,
    };
  },
});

// New alias with better naming
export const runPromptAnalysis = runKeywordSetAnalysis;
