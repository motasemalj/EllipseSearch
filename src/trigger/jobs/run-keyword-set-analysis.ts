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

import { task } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import type { SupportedEngine, RunAnalysisInput, SimulationMode } from "@/types";
import { DEFAULT_BROWSER_SIMULATION_MODE } from "@/lib/ai/openai-config";
import { isRpaAvailable } from "@/lib/rpa/status";

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

  run: async (payload: RunAnalysisInput, { ctx }) => {
    // Support both prompt_set_id (new) and keyword_set_id (legacy)
    const prompt_set_id = payload.prompt_set_id;
    const prompt_ids = payload.prompt_ids;
    const { 
      brand_id, 
      engines, 
      language, 
      region = "global", 
      enable_hallucination_watchdog,
      simulation_mode: requestedMode = DEFAULT_BROWSER_SIMULATION_MODE,
      ensemble_run_count,
      enable_variance_metrics,
    } = payload;
    
    // IMPORTANT: Check RPA availability FIRST
    // If RPA is online, ALL AI response generations should go through RPA
    // API is only a fallback when RPA is offline
    let simulation_mode: SimulationMode = requestedMode as SimulationMode;
    
    try {
      const rpaStatus = await isRpaAvailable();
      
      if (rpaStatus.available && rpaStatus.workerCount > 0) {
        // RPA is online - use it for ALL engines that it supports
        const requestedEngines = new Set(engines);
        const rpaEngines = new Set(rpaStatus.engines);
        const allEnginesSupported = Array.from(requestedEngines).every(e => rpaEngines.has(e));
        
        if (allEnginesSupported) {
          simulation_mode = 'rpa';
          console.log(`🤖 RPA is ONLINE (${rpaStatus.workerCount} worker(s), engines: ${rpaStatus.engines.join(', ')})`);
          console.log(`   → Using RPA mode for ALL ${engines.length} engines`);
        } else {
          // Some engines not supported by RPA - log warning but still use RPA for supported ones
          const unsupportedEngines = Array.from(requestedEngines).filter(e => !rpaEngines.has(e));
          console.log(`⚠️ RPA is online but doesn't support: ${unsupportedEngines.join(', ')}`);
          console.log(`   → Using RPA for: ${Array.from(requestedEngines).filter(e => rpaEngines.has(e)).join(', ')}`);
          simulation_mode = 'rpa'; // Still use RPA, check-prompt-visibility will fallback per-engine if needed
        }
      } else {
        console.log(`📡 RPA is OFFLINE - using API fallback mode`);
        simulation_mode = 'api';
      }
    } catch (rpaCheckError) {
      console.warn(`⚠️ Could not check RPA status: ${rpaCheckError instanceof Error ? rpaCheckError.message : 'Unknown error'}`);
      console.log(`   → Using ${requestedMode} mode as fallback`);
      simulation_mode = requestedMode as SimulationMode;
    }
    
    // Log final simulation mode
    const modeLabel = simulation_mode === 'api' ? 'API' : simulation_mode === 'browser' ? 'Browser (Playwright)' : simulation_mode === 'rpa' ? 'RPA' : 'Hybrid';
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
      .select("id, domain, last_crawled_at")
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
    // 4. CRAWL IS HANDLED BY ANALYSIS API (NOT HERE)
    // ═══════════════════════════════════════════════════════════════
    // Crawl is now triggered ONCE by the /api/analysis/run endpoint
    // before this job runs. This prevents duplicate crawl triggers.
    // ═══════════════════════════════════════════════════════════════
    
    const needsCrawl = !brand.last_crawled_at || 
      (Date.now() - new Date(brand.last_crawled_at).getTime()) > CRAWL_FRESHNESS_HOURS * 60 * 60 * 1000;
    
    if (needsCrawl && brand.domain) {
      console.log(`⚠️ Crawl data is stale for ${brand.domain} - should have been triggered by API`);
      console.log(`   Continuing with simulations (crawl may be in progress from API)`);
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

    // IMPORTANT: When using trigger()/batchTrigger() (non-wait), Trigger does NOT version-lock child runs.
    // In dev mode this can lead to child runs stuck in PENDING_VERSION. Explicitly lock children to this run's version.
    const childVersion = ctx.run.version ?? ctx.deployment?.version;
    
    // 5.2 Build all simulation payloads
    const simulationPayloads = [];
    for (const prompt of prompts) {
      for (const engine of engines as SupportedEngine[]) {
        // Per-engine queue override to avoid stampeding one provider.
        // NOTE: In SDK v4+ (even via the /v3 import path), queues must be defined ahead of time.
        // We override by queue NAME here; concurrency is defined in `check-prompt-visibility.ts`.
        const queueName = `sim-${engine}`;

        simulationPayloads.push({
          payload: {
            brand_id,
            prompt_id: prompt.id,
            prompt_text: prompt.text,
            keyword_id: prompt.id, // For backwards compatibility
            analysis_batch_id: batchId,
            engine,
            language,
            region,
            enable_hallucination_watchdog,
            simulation_mode: simulation_mode as SimulationMode,
            // Pass ensemble settings from UI (overrides env defaults)
            ensemble_run_count,
            enable_variance_metrics,
          },
          options: {
            queue: queueName,
            idempotencyKey: `sim-${batchId}-${prompt.id}-${engine}`,
            ...(childVersion ? { version: childVersion } : {}),
          },
        });
      }
    }

    console.log(`   📦 Created ${simulationPayloads.length} parallel simulation tasks`);

    // 5.3 Execute ALL simulations in parallel using batchTrigger (non-blocking).
    // We no longer wait in the parent task because waiting can cause "stuck" runs if any provider hangs.
    // Each simulation run updates its own record + increments batch progress; finalization is debounced.
    const startTime = Date.now();
    const batchHandle = await checkPromptVisibility.batchTrigger(simulationPayloads);
    const triggerDuration = Date.now() - startTime;

    await supabase
      .from("analysis_batches")
      .update({
        status: "processing",
        error_message: null,
      })
      .eq("id", batchId);

    const triggerBatchId =
      (batchHandle as unknown as { batchId?: string; id?: string })?.batchId ||
      (batchHandle as unknown as { batchId?: string; id?: string })?.id ||
      "unknown";
    console.log(`   ⚡ Triggered ${simulationPayloads.length} simulation runs in ${Math.round(triggerDuration / 1000)}s (batch: ${triggerBatchId})`);

    return {
      batch_id: batchId,
      total_simulations: totalSimulations,
      triggered: simulationPayloads.length,
      trigger_batch_id: triggerBatchId,
      duration_ms: triggerDuration,
    };
  },
});

// New alias with better naming
export const runPromptAnalysis = runKeywordSetAnalysis;
