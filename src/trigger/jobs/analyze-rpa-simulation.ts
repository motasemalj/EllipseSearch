/**
 * Job: analyze-rpa-simulation
 * 
 * Runs full GPT-based analysis on RPA simulation results.
 * This runs in the background so the RPA webhook can respond quickly.
 * 
 * Flow:
 * 1. RPA sends result → webhook stores basic data → triggers this job
 * 2. This job runs GPT analysis (selection signals, recommendations)
 * 3. Updates simulation with full analysis
 */

import { task, tasks, queue } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { 
  analyzeSelectionSignals,
  enhanceWithTieredRecommendations,
} from "@/lib/ai/selection-signals";
import { 
  detectHallucinations,
  detectNegativeHallucination,
  type GroundTruthData,
  type HallucinationResult,
} from "@/lib/ai/hallucination-detector";
import { analyzeSentiment } from "@/lib/ai/sentiment-analyzer";
import { generateSchemaFix } from "@/lib/ai/schema-generator";
import type { 
  SupportedEngine, 
  SupportedLanguage, 
  SupportedRegion,
  ActionItem,
  DetectedHallucination,
} from "@/types";
import type { CrawlAnalysis } from "@/lib/ai/crawl-analyzer";
import { ENRICHMENT_PIPELINE_VERSION, VISIBILITY_CONTRACT_VERSION } from "@/lib/ai/versions";

/**
 * Strip HTML tags and decode entities to get plain text for sentiment analysis.
 * This is important because sentiment analysis works better with clean text.
 */
function stripHtmlToPlainText(html: string): string {
  if (!html) return "";
  
  return html
    // Remove script and style content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    // Replace block elements with newlines
    .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, "\n")
    .replace(/<(br|hr)[^>]*\/?>/gi, "\n")
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, " ")
    // Decode common HTML entities
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&#\d+;/g, "") // Remove numeric entities
    // Clean up whitespace
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

// Create Supabase client with service role
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// RPA analysis queue - controls parallelism for GPT analysis calls
const rpaAnalysisQueue = queue({
  name: "rpa-analysis",
  concurrencyLimit: 10, // Max 10 RPA analyses at once (GPT rate limits)
});

interface AnalyzeRpaSimulationInput {
  simulation_id: string;
  brand_id: string;
  prompt_id: string;
  analysis_batch_id?: string;
  engine: SupportedEngine;
  language: SupportedLanguage;
  region: SupportedRegion;
}

export const analyzeRpaSimulation = task({
  id: "analyze-rpa-simulation",
  // IMPORTANT: RPA analysis can include multiple LLM calls (selection signals + hallucination + sentiment)
  // and routinely exceeds 90s in real conditions. If this task times out, `enrichment_status` never flips
  // to completed/failed and `finalize-analysis-batch` will keep the batch stuck "processing".
  maxDuration: 240, // 4 minutes
  queue: rpaAnalysisQueue, // Use queue for concurrency control
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 1000, // Reduced from 2000
    maxTimeoutInMs: 8000, // Reduced from 10000
  },

  run: async (payload: AnalyzeRpaSimulationInput) => {
    const { 
      simulation_id, 
      brand_id, 
      analysis_batch_id,
      engine,
    } = payload;
    
    const supabase = getSupabase();
    
    console.log(`[RPA Analysis] Starting analysis for simulation ${simulation_id}`);
    
    // NOTE: This task must be "never-fail" to avoid batches getting stuck in processing.
    // Always set enrichment_status to completed/failed and update batch progress on exit paths.
    try {
      // 1. Fetch simulation data
      const { data: simulation, error: simError } = await supabase
        .from("simulations")
        .select("*")
        .eq("id", simulation_id)
        .single();
      
      if (simError || !simulation) {
        throw new Error(`Simulation not found: ${simulation_id}`);
      }
      
      // 2. Fetch brand data
      const { data: brand, error: brandError } = await supabase
        .from("brands")
        .select("*")
        .eq("id", brand_id)
        .single();
      
      if (brandError || !brand) {
        throw new Error(`Brand not found: ${brand_id}`);
      }
    
      const brandName = brand.name || "";
      const brandDomain = brand.domain || "";
      const brandAliases = brand.brand_aliases || [];
    
      // Build comprehensive aliases
      const allAliases = [...brandAliases];
      if (brandName) {
        allAliases.push(brandName);
        const simplified = brandName.replace(/properties|realty|real estate|group|holdings|development|developers|uae|dubai/gi, '').trim();
        if (simplified.length > 2 && !allAliases.includes(simplified)) {
          allAliases.push(simplified);
        }
      }
    
      // 3. Validate we have content to analyze
      const responseHtml = simulation.ai_response_html || "";
      const responseLength = responseHtml.length;
    
    console.log(`[RPA Analysis] Response content: ${responseLength} chars`);
    
      if (responseLength < 20) {
        console.warn(`[RPA Analysis] Response too short (${responseLength} chars), skipping GPT analysis`);
        
        // Mark as failed enrichment so batches can finalize
        await supabase
          .from("simulations")
          .update({
            status: "completed",
            selection_signals: {
              ...simulation.selection_signals,
              analysis_pending: false,
              analysis_error: `Response too short for analysis (${responseLength} chars)`,
              is_visible: simulation.is_visible || false,
              sentiment: "neutral",
              recommendation: "The AI response was too short for full analysis. This may indicate a browser automation issue. Please try running the analysis again.",
              enrichment_pipeline_version: ENRICHMENT_PIPELINE_VERSION,
              visibility_contract_version: VISIBILITY_CONTRACT_VERSION,
            },
            enrichment_status: "failed",
            enrichment_error: `Response too short for analysis (${responseLength} chars)`,
            enrichment_completed_at: new Date().toISOString(),
            analysis_stage: "completed_with_error",
          })
          .eq("id", simulation_id);
        
        // Update batch progress + finalize (best-effort)
        if (analysis_batch_id) {
          try {
            await supabase.rpc("increment_batch_completed", { batch_id: analysis_batch_id });
          } catch {
            // ignore
          }
          await tasks.trigger(
            "finalize-analysis-batch",
            { analysis_batch_id },
            { debounce: { key: `finalize-${analysis_batch_id}`, delay: "10s", mode: "trailing" } }
          );
        }
        
        return {
          simulation_id,
          is_visible: simulation.is_visible || false,
          sentiment: "neutral",
          analyzed: false,
          error: `Response too short (${responseLength} chars)`,
        };
      }
    
    // 3.5 Run GPT-based selection signal analysis
    console.log(`[RPA Analysis] Running GPT analysis for ${engine}...`);
    console.log(`[RPA Analysis] Content to analyze (first 500 chars): ${responseHtml.slice(0, 500)}`);
    console.log(`[RPA Analysis] Search context: ${simulation.search_context?.results?.length || 0} results`);
    
      let selectionSignals;
      try {
      selectionSignals = await analyzeSelectionSignals({
        answer_html: responseHtml,
        answer_text: responseHtml, // Also pass as text in case HTML parsing is needed
        search_context: simulation.search_context,
        brand_domain: brandDomain,
        brand_aliases: allAliases,
        engine,
        keyword: simulation.prompt_text,
      });
      
      console.log(`[RPA Analysis] GPT analysis complete: visible=${selectionSignals.is_visible}, sentiment=${selectionSignals.sentiment}`);
      
      // 3.6 Hallucination Watchdog (if enabled)
      const storedSelectionSignals = simulation.selection_signals as { hallucination_watchdog?: { enabled?: boolean } } | null;
      const enableHallucinationWatchdog = storedSelectionSignals?.hallucination_watchdog?.enabled === true;
      
      // Log the flag value explicitly for debugging
      console.log(`[RPA Analysis] 🐕 Hallucination Watchdog: stored=${JSON.stringify(storedSelectionSignals?.hallucination_watchdog)}, enabled=${enableHallucinationWatchdog}`);

      let groundTruthContent: string | undefined;
      let structuredGroundTruth: GroundTruthData | undefined;
      
      if (enableHallucinationWatchdog && brand.last_crawled_at) {
        const { data: crawledPages } = await supabase
          .from("crawled_pages")
          .select("title, content_excerpt, url")
          .eq("brand_id", brand_id)
          .order("created_at", { ascending: false })
          .limit(15);

        if (crawledPages && crawledPages.length > 0) {
          groundTruthContent = crawledPages
            .map(page => `## ${page.title || page.url}\n${page.content_excerpt || ""}`)
            .join("\n\n---\n\n");
          console.log(`[RPA Analysis] Loaded ground truth from ${crawledPages.length} crawled pages`);

          const groundTruthSummary = brand.ground_truth_summary as {
            structured_data?: {
              pricing?: { plan_name: string; price: string; features?: string[]; is_free?: boolean }[];
              features?: string[];
              products?: string[];
              services?: string[];
              company_description?: string;
              tagline?: string;
              locations?: string[];
            };
          } | null;

          if (groundTruthSummary?.structured_data) {
            structuredGroundTruth = {
              ...groundTruthSummary.structured_data,
              raw_content: groundTruthContent,
              crawled_pages: crawledPages.map(p => ({
                url: p.url,
                title: p.title || p.url,
                excerpt: p.content_excerpt || "",
              })),
            };
            console.log(`[RPA Analysis] Loaded structured ground truth: ${structuredGroundTruth.pricing?.length || 0} pricing, ${structuredGroundTruth.features?.length || 0} features`);
          }
        }
      }

      let hallucinationResult: HallucinationResult | undefined;
      if (enableHallucinationWatchdog && structuredGroundTruth) {
        console.log(`[RPA Analysis] Hallucination Watchdog ENABLED - running detection...`);

        hallucinationResult = await detectHallucinations(
          responseHtml,
          structuredGroundTruth,
          brandName,
          brandDomain
        );

        const negativeHallucination = detectNegativeHallucination(
          responseHtml,
          structuredGroundTruth
        );

        if (negativeHallucination) {
          hallucinationResult.hallucinations.push(negativeHallucination);
          hallucinationResult.has_hallucinations = true;
        }

        (selectionSignals as unknown as Record<string, unknown>).hallucination_watchdog = {
          enabled: true,
          result: hallucinationResult,
        };

        if (hallucinationResult.has_hallucinations) {
          const brandSettings = (brand.settings || {}) as Record<string, unknown>;

          const enhancedActionItems = hallucinationResult.hallucinations.map((h: DetectedHallucination) => {
            const schemaFix = generateSchemaFix(h, {
              name: brandName,
              domain: brandDomain,
              description: brandSettings.product_description as string,
              industry: brandSettings.industry as string,
              services: structuredGroundTruth?.services,
              products: structuredGroundTruth?.products,
              pricing: structuredGroundTruth?.pricing,
            }, structuredGroundTruth);

            if (schemaFix) {
              h.recommendation.schema_fix = schemaFix;
            }

            return {
              priority: (h.severity === "critical" ? "high" : h.severity === "major" ? "medium" : "foundational") as ActionItem["priority"],
              category: "content" as const,
              title: h.recommendation.title,
              description: h.recommendation.description,
              steps: [h.recommendation.specific_fix],
            };
          });

          (selectionSignals as unknown as Record<string, unknown>).action_items = [
            ...enhancedActionItems,
            ...((selectionSignals as unknown as Record<string, unknown>).action_items as ActionItem[] || []),
          ];
        }
      } else if (!enableHallucinationWatchdog) {
        (selectionSignals as unknown as Record<string, unknown>).hallucination_watchdog = {
          enabled: false,
          result: null,
        };
      } else {
        console.log(`[RPA Analysis] Hallucination Watchdog ENABLED but no ground truth data available`);
        (selectionSignals as unknown as Record<string, unknown>).hallucination_watchdog = {
          enabled: true,
          result: null,
          no_ground_truth: true,
        };
      }

      // Get crawl analysis for actionable recommendations
      const groundTruthSummary = brand.ground_truth_summary as {
        crawl_analysis?: CrawlAnalysis;
      } | null;
      
      const crawlAnalysis = groundTruthSummary?.crawl_analysis;
      
      if (!crawlAnalysis) {
        // NOTE: Crawl is triggered ONCE by /api/analysis/run endpoint, NOT here
        // This prevents multiple simulations from triggering duplicate crawls
        console.log(`[RPA Analysis] No crawl data available - crawl may be in progress (triggered by API)`);
      }
      
      // Enhance with tiered recommendations
      selectionSignals = enhanceWithTieredRecommendations({
        selectionSignals,
        brandName,
        brandDomain,
        query: simulation.prompt_text,
        engine,
        crawlAnalysis,
      });

      // 3.7 Sentiment Analysis - run for all RPA responses (not gated by visibility)
      // Sentiment can be detected even when brand isn't explicitly mentioned
      // IMPORTANT: Use plain text, not HTML - LLM analyzes sentiment better on clean text
      let sentimentAnalysis: unknown = null;
      let netSentimentScore: number | null = null;
      try {
        const responseHtmlForSentiment = simulation.ai_response_html || "";
        const responseTextForSentiment = stripHtmlToPlainText(responseHtmlForSentiment);
        
        if (responseTextForSentiment.length > 50) {
          console.log(`[RPA Analysis] Running sentiment analysis for ${engine} (${responseTextForSentiment.length} chars of plain text)...`);
          const sentiment = await analyzeSentiment(responseTextForSentiment, brandName);
          sentimentAnalysis = sentiment;
          netSentimentScore = sentiment.net_sentiment_score;
          console.log(`[RPA Analysis] Sentiment: polarity=${sentiment.polarity.toFixed(2)}, NSS=${netSentimentScore}`);
        } else {
          console.log(`[RPA Analysis] Skipping sentiment - response too short (${responseTextForSentiment.length} chars plain text from ${responseHtmlForSentiment.length} chars HTML)`);
        }
      } catch (sentimentError) {
        console.warn(`[RPA Analysis] Sentiment analysis failed (non-fatal):`, sentimentError);
        // Non-fatal: continue without sentiment
      }

      // Store sentiment in selection signals
      (selectionSignals as unknown as Record<string, unknown>).sentiment_analysis = sentimentAnalysis;
      (selectionSignals as unknown as Record<string, unknown>).net_sentiment_score = netSentimentScore;
      
      } catch (analysisError) {
        console.error("[RPA Analysis] GPT analysis failed:", analysisError);

        // Mark as failed enrichment so batches can finalize (do NOT re-throw)
        await supabase
          .from("simulations")
          .update({
            status: "completed",
            selection_signals: {
              ...simulation.selection_signals,
              analysis_pending: false,
              analysis_error: String(analysisError),
              is_visible: simulation.is_visible || false,
              sentiment: "neutral",
              recommendation: "Analysis could not be completed due to an error. Please try again.",
              enrichment_pipeline_version: ENRICHMENT_PIPELINE_VERSION,
              visibility_contract_version: VISIBILITY_CONTRACT_VERSION,
            },
            enrichment_status: "failed",
            enrichment_error: String(analysisError),
            enrichment_completed_at: new Date().toISOString(),
            analysis_stage: "completed_with_error",
          })
          .eq("id", simulation_id);

        // Update batch progress + finalize (best-effort)
        if (analysis_batch_id) {
          try {
            await supabase.rpc("increment_batch_completed", { batch_id: analysis_batch_id });
          } catch {
            // ignore
          }
          await tasks.trigger(
            "finalize-analysis-batch",
            { analysis_batch_id },
            { debounce: { key: `finalize-${analysis_batch_id}`, delay: "10s", mode: "trailing" } }
          );
        }
        
        return {
          simulation_id,
          is_visible: simulation.is_visible || false,
          sentiment: "neutral",
          analyzed: false,
          error: String(analysisError),
        };
      }
    
      // 4. Merge with existing data (preserve RPA-specific fields)
      const existingSignals = simulation.selection_signals || {};
      const signalsRecord = selectionSignals as unknown as Record<string, unknown>;
      const mergedSignals = {
        ...selectionSignals,
        // Preserve RPA metadata
        source: existingSignals.source || "rpa",
        rpa_run_id: existingSignals.rpa_run_id,
        rpa_duration_seconds: existingSignals.rpa_duration_seconds,
        rpa_citation_count: existingSignals.rpa_citation_count,
        // Preserve citation authorities from RPA
        citation_authorities: existingSignals.citation_authorities,
        brand_mentions: existingSignals.brand_mentions,
        brand_citations: existingSignals.brand_citations,
        // Use best visibility signal
        is_visible: selectionSignals.is_visible || simulation.is_visible,
        // Include sentiment analysis results
        sentiment_analysis: signalsRecord.sentiment_analysis || null,
        net_sentiment_score: signalsRecord.net_sentiment_score ?? null,
        // Mark analysis complete
        analysis_pending: false,
        enrichment_pipeline_version: ENRICHMENT_PIPELINE_VERSION,
        visibility_contract_version: VISIBILITY_CONTRACT_VERSION,
      };
    
    // 5. Update simulation with full analysis
      const { error: updateError } = await supabase
        .from("simulations")
        .update({
          is_visible: mergedSignals.is_visible,
          sentiment: selectionSignals.sentiment,
          selection_signals: mergedSignals,
          status: "completed",
          // Best-effort enrichment lifecycle fields (used by finalize-analysis-batch)
          enrichment_status: "completed",
          enrichment_completed_at: new Date().toISOString(),
          analysis_stage: "completed",
        })
        .eq("id", simulation_id);
      
      if (updateError) {
        // Don't throw: mark as failed enrichment so the batch doesn't get stuck
        console.error(`[RPA Analysis] Failed to update simulation ${simulation_id}: ${updateError.message}`);
        await supabase
          .from("simulations")
          .update({
            status: "completed",
            enrichment_status: "failed",
            enrichment_error: `Failed to update simulation: ${updateError.message}`,
            enrichment_completed_at: new Date().toISOString(),
            analysis_stage: "completed_with_error",
          })
          .eq("id", simulation_id);
      }
    
    console.log(`[RPA Analysis] Updated simulation ${simulation_id} with full analysis`);
    
      // 6. Update batch progress if applicable
      if (analysis_batch_id) {
      try {
        // Use the correct function name: increment_batch_completed
        await supabase.rpc("increment_batch_completed", {
          batch_id: analysis_batch_id,
        });
        console.log(`[RPA Analysis] Updated batch progress for ${analysis_batch_id}`);
      } catch (e) {
        console.warn("[RPA Analysis] RPC failed, using fallback batch update:", e);
        
        // Fallback: Directly check and update batch status
        try {
          // Count completed simulations for this batch
          const { count: completedCount } = await supabase
            .from("simulations")
            .select("*", { count: "exact", head: true })
            .eq("analysis_batch_id", analysis_batch_id)
            .eq("status", "completed");
          
          // Get batch info
          const { data: batch } = await supabase
            .from("analysis_batches")
            .select("total_simulations, status")
            .eq("id", analysis_batch_id)
            .single();
          
          if (batch && completedCount !== null) {
            // Update completed_simulations count
            await supabase
              .from("analysis_batches")
              .update({ 
                completed_simulations: completedCount,
                updated_at: new Date().toISOString(),
              })
              .eq("id", analysis_batch_id);
          }
        } catch (fallbackError) {
          console.error("[RPA Analysis] Fallback batch update also failed:", fallbackError);
        }
      }

        await tasks.trigger(
          "finalize-analysis-batch",
          { analysis_batch_id },
          { debounce: { key: `finalize-${analysis_batch_id}`, delay: "10s", mode: "trailing" } }
        );
      }
      
      return {
        simulation_id,
        is_visible: mergedSignals.is_visible,
        sentiment: selectionSignals.sentiment,
        analyzed: true,
      };
    } catch (fatalError) {
      // Absolute safety net: do not let this task fail and strand the batch.
      const msg = fatalError instanceof Error ? fatalError.message : String(fatalError);
      console.error(`[RPA Analysis] Fatal error (safety net): ${msg}`);
      try {
        await supabase
          .from("simulations")
          .update({
            status: "completed",
            selection_signals: {
              analysis_pending: false,
              analysis_error: msg,
              enrichment_pipeline_version: ENRICHMENT_PIPELINE_VERSION,
              visibility_contract_version: VISIBILITY_CONTRACT_VERSION,
            },
            enrichment_status: "failed",
            enrichment_error: msg,
            enrichment_completed_at: new Date().toISOString(),
            analysis_stage: "completed_with_error",
          })
          .eq("id", simulation_id);
      } catch {
        // ignore
      }

      if (analysis_batch_id) {
        try {
          await supabase.rpc("increment_batch_completed", { batch_id: analysis_batch_id });
        } catch {
          // ignore
        }
        try {
          await tasks.trigger(
            "finalize-analysis-batch",
            { analysis_batch_id },
            { debounce: { key: `finalize-${analysis_batch_id}`, delay: "10s", mode: "trailing" } }
          );
        } catch {
          // ignore
        }
      }

      return {
        simulation_id,
        is_visible: false,
        sentiment: "neutral",
        analyzed: false,
        error: msg,
      };
    }
  },
});

// ===========================================
// AUTO-CRAWL HELPER
// ===========================================

/**
 * Trigger website crawl if no crawl data exists.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function triggerAutoCrawlIfNeeded(
  supabase: ReturnType<typeof getSupabase>,
  brandId: string,
  brand: { name: string; domain: string }
): Promise<CrawlAnalysis | null> {
  try {
    // Check if there's already a completed crawl
    const { data: existingCrawl } = await supabase
      .from("crawl_jobs")
      .select("id, status, completed_at")
      .eq("brand_id", brandId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();
    
    if (existingCrawl) {
      // Re-fetch brand to get crawl analysis
      const { data: updatedBrand } = await supabase
        .from("brands")
        .select("ground_truth_summary")
        .eq("id", brandId)
        .single();
      
      const summary = updatedBrand?.ground_truth_summary as { crawl_analysis?: CrawlAnalysis } | null;
      return summary?.crawl_analysis || null;
    }
    
    // Check if there's a crawl in progress
    const { data: inProgressCrawl } = await supabase
      .from("crawl_jobs")
      .select("id, status")
      .eq("brand_id", brandId)
      .in("status", ["pending", "crawling"])
      .single();
    
    if (inProgressCrawl) {
      console.log(`[RPA Analysis] Crawl already in progress`);
      return null;
    }
    
    // Trigger a quick crawl
    console.log(`[RPA Analysis] Triggering auto-crawl for ${brand.domain}...`);
    
    let startUrl = brand.domain;
    if (!startUrl.startsWith("http://") && !startUrl.startsWith("https://")) {
      startUrl = `https://${startUrl}`;
    }
    
    const { data: crawlJob, error: createError } = await supabase
      .from("crawl_jobs")
      .insert({
        brand_id: brandId,
        status: "pending",
        start_url: startUrl,
        max_pages: 10,
        max_depth: 2,
        include_paths: [],
        exclude_paths: [],
      })
      .select()
      .single();
    
    if (createError || !crawlJob) {
      console.error(`[RPA Analysis] Failed to create crawl job:`, createError);
      return null;
    }
    
    try {
      await tasks.trigger("crawl-brand-website", {
        brand_id: brandId,
        crawl_job_id: crawlJob.id,
        start_url: startUrl,
        max_pages: 10,
        max_depth: 2,
        include_paths: [],
        exclude_paths: [],
      });
      
      console.log(`[RPA Analysis] Auto-crawl triggered (job: ${crawlJob.id})`);
      
    } catch (triggerError) {
      console.error(`[RPA Analysis] Failed to trigger crawl:`, triggerError);
      
      await supabase
        .from("crawl_jobs")
        .update({ 
          status: "failed", 
          error_message: `Auto-crawl trigger failed` 
        })
        .eq("id", crawlJob.id);
    }
    
    return null;
    
  } catch (error) {
    console.error(`[RPA Analysis] Auto-crawl error:`, error);
    return null;
  }
}

