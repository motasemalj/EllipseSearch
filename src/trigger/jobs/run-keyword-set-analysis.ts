/**
 * Job: run-prompt-analysis
 * 
 * Orchestrates a multi-prompt, multi-engine analysis run.
 * 
 * OPTIMIZED FLOW (v2 - Parallel Execution):
 * 1. FIRE crawl job in background (non-blocking)
 * 2. Run ALL simulations in PARALLEL using batchTriggerAndWait
 * 3. Collect results and update batch status
 * 
 * Performance improvements:
 * - All prompt/engine combinations run simultaneously
 * - Crawl runs in parallel, doesn't block simulations
 * - Uses Trigger.dev batch processing for optimal throughput
 * - Queue-based concurrency control prevents rate limiting
 * 
 * Supports both prompt sets AND individual prompts.
 */

import { task, tasks } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import type { SupportedEngine, RunAnalysisInput, SimulationMode } from "@/types";
import { DEFAULT_BROWSER_SIMULATION_MODE } from "@/lib/ai/openai-config";

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
  maxDuration: 600, // 10 minutes max (reduced from 15 - parallelism makes it faster)
  
  // Use a queue to manage concurrency across multiple analysis runs
  queue: {
    concurrencyLimit: 5, // Max 5 analysis batches running at once
  },

  run: async (payload: RunAnalysisInput) => {
    // Support both prompt_set_id (new) and keyword_set_id (legacy)
    const prompt_set_id = payload.prompt_set_id;
    const prompt_ids = payload.prompt_ids;
    const { 
      brand_id, 
      engines, 
      language, 
      region = "global", 
      enable_hallucination_watchdog,
      simulation_mode = DEFAULT_BROWSER_SIMULATION_MODE,
    } = payload;
    
    // Log simulation mode
    const modeLabel = simulation_mode === 'api' ? 'API' : simulation_mode === 'browser' ? 'Browser (Playwright)' : 'Hybrid';
    console.log(`Analysis mode: ${modeLabel}`);
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
      // When running single prompt analysis, set prompt_id on the batch
      const singlePromptId = (prompt_ids && prompt_ids.length === 1) ? prompt_ids[0] : null;
      
      // Create new batch
      const { data: newBatch, error: batchError } = await supabase
        .from("analysis_batches")
        .insert({
          brand_id,
          prompt_set_id: prompt_set_id || null,
          prompt_id: singlePromptId, // Set when running single prompt analysis
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
    // 4. FIRE CRAWL IN BACKGROUND (NON-BLOCKING)
    // ═══════════════════════════════════════════════════════════════
    // Crawl runs in parallel - simulations start IMMEDIATELY
    // Crawl data will be used if available, otherwise generic recs
    // ═══════════════════════════════════════════════════════════════
    
    const needsCrawl = !brand.last_crawled_at || 
      (Date.now() - new Date(brand.last_crawled_at).getTime()) > CRAWL_FRESHNESS_HOURS * 60 * 60 * 1000;
    
    if (needsCrawl && brand.domain) {
      console.log(`🕷️ Triggering background crawl for ${brand.domain} (non-blocking)`);
      
      // Ensure domain has protocol
      let startUrl = brand.domain;
      if (!startUrl.startsWith('http')) {
        startUrl = `https://${startUrl}`;
      }
      
      // Fire and forget - don't await
      tasks.trigger("crawl-brand-website", {
        brand_id,
        crawl_job_id: null, // Will be created by the job
        start_url: startUrl,
        max_pages: 20,
        max_depth: 2,
        include_paths: [],
        exclude_paths: [],
      }).catch(err => console.warn(`Background crawl trigger failed: ${err}`));
      
      console.log(`   ✓ Crawl triggered in background, continuing with simulations...`);
    } else {
      console.log(`✓ Using existing crawl data from ${brand.last_crawled_at}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // 5. RUN ALL SIMULATIONS IN PARALLEL
    // ═══════════════════════════════════════════════════════════════
    // This is the key optimization - all prompt/engine combinations
    // run simultaneously using Trigger.dev's batchTriggerAndWait
    // ═══════════════════════════════════════════════════════════════

    console.log(`🚀 Running ${prompts.length} prompts x ${engines.length} engines = ${totalSimulations} simulations IN PARALLEL`);

    // 5.1 Import the child task
    const { checkPromptVisibility } = await import("./check-prompt-visibility");
    
    // 5.2 Build all simulation payloads
    const simulationPayloads = [];
    for (const prompt of prompts) {
      for (const engine of engines as SupportedEngine[]) {
        simulationPayloads.push({
          payload: {
            brand_id,
            prompt_id: prompt.id,
            keyword_id: prompt.id, // For backwards compatibility
            analysis_batch_id: batchId,
            engine,
            language,
            region,
            enable_hallucination_watchdog,
            simulation_mode: simulation_mode as SimulationMode,
          },
        });
      }
    }

    console.log(`   📦 Created ${simulationPayloads.length} parallel simulation tasks`);

    // 5.3 Execute ALL simulations in parallel using batchTriggerAndWait
    // Trigger.dev handles concurrency and queuing internally
    const startTime = Date.now();
    const batchResult = await checkPromptVisibility.batchTriggerAndWait(simulationPayloads);
    const parallelDuration = Date.now() - startTime;
    
    // Extract runs array from batch result
    const results = batchResult.runs || [];
    console.log(`   ⚡ All ${results.length} simulations completed in ${Math.round(parallelDuration / 1000)}s`);

    // 5.4 Process results
    let completedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const payload = simulationPayloads[i].payload;
      const promptText = prompts.find(p => p.id === payload.prompt_id)?.text || payload.prompt_id;

      if (result.ok) {
        completedCount++;
        console.log(`   ✓ ${payload.engine}: "${promptText.slice(0, 40)}..." - visible: ${result.output?.is_visible}`);
      } else {
        errors.push(`${promptText} (${payload.engine}): ${result.error}`);
        console.error(`   ✗ ${payload.engine}: "${promptText.slice(0, 40)}..." - ${result.error}`);
        completedCount++; // Count as completed (failed) for progress
      }
    }

    // 5.5 Update final batch progress
    await supabase
      .from("analysis_batches")
      .update({ completed_simulations: completedCount })
      .eq("id", batchId);

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

    const avgTimePerSim = Math.round(parallelDuration / totalSimulations);
    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`✓ Batch ${batchId} COMPLETED`);
    console.log(`  Total time: ${Math.round(parallelDuration / 1000)}s (${avgTimePerSim}ms avg per simulation)`);
    console.log(`  Simulations: ${completedCount}/${totalSimulations} (${errors.length} errors)`);
    console.log(`  Status: ${finalStatus}`);
    console.log(`═══════════════════════════════════════════════════════════\n`);

    return {
      batch_id: batchId,
      total_simulations: totalSimulations,
      completed: completedCount,
      errors: errors.length,
      duration_ms: parallelDuration,
      avg_time_per_simulation_ms: avgTimePerSim,
    };
  },
});

// New alias with better naming
export const runPromptAnalysis = runKeywordSetAnalysis;
