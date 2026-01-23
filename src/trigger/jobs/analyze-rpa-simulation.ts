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

import { task, tasks } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { 
  analyzeSelectionSignals,
  enhanceWithTieredRecommendations,
} from "@/lib/ai/selection-signals";
import type { SupportedEngine, SupportedLanguage, SupportedRegion } from "@/types";
import type { CrawlAnalysis } from "@/lib/ai/crawl-analyzer";

// Create Supabase client with service role
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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
  maxDuration: 120, // 2 minutes max
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 10000,
  },

  run: async (payload: AnalyzeRpaSimulationInput) => {
    const { 
      simulation_id, 
      brand_id, 
      prompt_id, 
      analysis_batch_id,
      engine,
      language,
      region,
    } = payload;
    
    const supabase = getSupabase();
    
    console.log(`[RPA Analysis] Starting analysis for simulation ${simulation_id}`);
    
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
      
      // Still mark as completed but flag the issue
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
          },
        })
        .eq("id", simulation_id);
      
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
      
      // Get crawl analysis for actionable recommendations
      const groundTruthSummary = brand.ground_truth_summary as {
        crawl_analysis?: CrawlAnalysis;
      } | null;
      
      let crawlAnalysis = groundTruthSummary?.crawl_analysis;
      
      if (!crawlAnalysis) {
        console.log(`[RPA Analysis] No crawl data - triggering auto-crawl...`);
        crawlAnalysis = await triggerAutoCrawlIfNeeded(supabase, brand_id, brand);
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
      
    } catch (analysisError) {
      console.error("[RPA Analysis] GPT analysis failed:", analysisError);
      // Update simulation to completed with error note - DON'T re-throw
      // We want the simulation to be marked completed even if analysis fails
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
          },
        })
        .eq("id", simulation_id);
      
      // Return success with error flag instead of throwing
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
      // Mark analysis complete
      analysis_pending: false,
    };
    
    // 5. Update simulation with full analysis
    const { error: updateError } = await supabase
      .from("simulations")
      .update({
        is_visible: mergedSignals.is_visible,
        sentiment: selectionSignals.sentiment,
        selection_signals: mergedSignals,
        status: "completed",
      })
      .eq("id", simulation_id);
    
    if (updateError) {
      throw new Error(`Failed to update simulation: ${updateError.message}`);
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
            
            // If all simulations are done, mark batch as completed
            if (completedCount >= batch.total_simulations && batch.status !== "completed") {
              await supabase
                .from("analysis_batches")
                .update({ 
                  status: "completed",
                  completed_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", analysis_batch_id);
              
              console.log(`[RPA Analysis] Batch ${analysis_batch_id} marked as completed (fallback)`);
            }
          }
        } catch (fallbackError) {
          console.error("[RPA Analysis] Fallback batch update also failed:", fallbackError);
        }
      }
    }
    
    return {
      simulation_id,
      is_visible: mergedSignals.is_visible,
      sentiment: selectionSignals.sentiment,
      analyzed: true,
    };
  },
});

// ===========================================
// AUTO-CRAWL HELPER
// ===========================================

/**
 * Trigger website crawl if no crawl data exists.
 */
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

