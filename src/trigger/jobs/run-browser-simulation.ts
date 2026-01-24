/**
 * Job: run-browser-simulation
 * 
 * Runs browser-based simulations using Playwright to capture
 * real AI responses with full DOM elements (citations, search chips, etc.)
 * 
 * This job provides higher fidelity results than API-based simulations
 * by capturing exactly what humans see in the browser.
 * 
 * Features:
 * - Headless browser automation
 * - Session management for authenticated access
 * - DOM parsing for citations and UI elements
 * - Hybrid mode support (API + Browser)
 */

import { task, queue } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { 
  runBrowserSimulation, 
  shutdownBrowserPool,
  type BrowserSimulationMode,
} from "@/lib/browser";
import type {
  SupportedEngine,
  SupportedLanguage,
  SupportedRegion,
} from "@/types";

// Browser simulation queue - controls parallelism for browser-based simulations
const browserSimQueue = queue({
  name: "browser-simulations",
  concurrencyLimit: 8, // Max 8 browser simulations at once (browser pool limit)
});

// ===========================================
// Types
// ===========================================

export interface BrowserSimulationInput {
  brand_id: string;
  prompt_id: string;
  analysis_batch_id: string;
  engine: SupportedEngine;
  language: SupportedLanguage;
  region: SupportedRegion;
  
  // Browser mode options
  mode: BrowserSimulationMode;
  use_auth?: boolean;
  capture_screenshots?: boolean;
  timeout_ms?: number;
}

export interface BrowserSimulationOutput {
  prompt_id: string;
  engine: SupportedEngine;
  mode: BrowserSimulationMode;
  is_visible: boolean;
  
  // Browser-specific metrics
  citation_count: number;
  source_card_count: number;
  search_chip_count: number;
  has_knowledge_panel: boolean;
  
  // Timing
  response_time_ms: number;
  total_time_ms: number;
  
  // Status
  success: boolean;
  error_message?: string;
}

// ===========================================
// Supabase Client
// ===========================================

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ===========================================
// Main Task
// ===========================================

export const runBrowserSimulationTask = task({
  id: "run-browser-simulation",
  maxDuration: 180, // 3 minutes max (reduced - faster with queue management)
  queue: browserSimQueue, // Use queue for concurrency control
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 2000, // Reduced from 5000
    maxTimeoutInMs: 15000, // Reduced from 30000
  },

  run: async (payload: BrowserSimulationInput): Promise<BrowserSimulationOutput> => {
    const { 
      brand_id, 
      prompt_id, 
      analysis_batch_id, 
      engine, 
      language, 
      region,
      mode,
      use_auth = false,
      capture_screenshots = false,
      timeout_ms = 120000,
    } = payload;

    const supabase = getSupabase();
    const startTime = Date.now();

    console.log(`[BrowserSim] Starting ${mode} simulation: ${engine} for prompt ${prompt_id}`);

    try {
      // 1. Fetch brand details
      const { data: brand, error: brandError } = await supabase
        .from("brands")
        .select("*")
        .eq("id", brand_id)
        .single();

      if (brandError || !brand) {
        throw new Error(`Brand not found: ${brand_id}`);
      }

      // 2. Fetch prompt
      const { data: prompt, error: promptError } = await supabase
        .from("prompts")
        .select("*")
        .eq("id", prompt_id)
        .single();

      if (promptError || !prompt) {
        throw new Error(`Prompt not found: ${prompt_id}`);
      }

      // 3. Run browser simulation
      console.log(`[BrowserSim] Running ${mode} mode for: "${prompt.text.slice(0, 50)}..."`);
      
      const result = await runBrowserSimulation({
        engine,
        prompt: prompt.text,
        language,
        region,
        brand_domain: brand.domain,
        mode,
        browser_options: {
          headless: true,
          timeout_ms: timeout_ms,
          capture_screenshots: capture_screenshots,
          use_auth: use_auth,
          block_images: true, // Faster loading
          block_analytics: true,
        },
        hybrid_options: mode === 'hybrid' ? {
          prefer_browser_citations: true,
          merge_sources: true,
          use_api_for_text: false,
        } : undefined,
      });

      // 4. Check visibility
      const isVisible = checkBrandVisibility(
        result.answer_html,
        brand.domain,
        brand.name,
        brand.brand_aliases || []
      );

      // 5. Extract browser-specific metrics
      const browserData = result.browser_data;
      const citationCount = browserData?.citations.length || result.sources.length;
      const sourceCardCount = browserData?.source_cards.length || 0;
      const searchChipCount = browserData?.search_chips.length || 0;
      const hasKnowledgePanel = !!browserData?.knowledge_panel;

      // 6. Store results in simulation record
      const { error: updateError } = await supabase
        .from("simulations")
        .upsert({
          brand_id,
          prompt_id,
          analysis_batch_id,
          engine,
          language,
          region,
          prompt_text: prompt.text,
          ai_response_html: result.answer_html,
          search_context: result.search_context || null,
          is_visible: isVisible,
          status: "completed",
          // Store browser-specific data in selection_signals
          selection_signals: {
            mode: result.mode,
            browser_data: browserData ? {
              citation_count: citationCount,
              source_card_count: sourceCardCount,
              search_chip_count: searchChipCount,
              has_knowledge_panel: hasKnowledgePanel,
              suggested_followups: browserData.suggested_followups,
              product_tiles: browserData.product_tiles.length,
              response_time_ms: browserData.response_time_ms,
              was_logged_in: browserData.was_logged_in,
            } : null,
            citations: browserData?.citations.map(c => ({
              index: c.index,
              url: c.url,
              title: c.title,
              is_inline: c.is_inline,
              citation_style: c.citation_style,
            })) || [],
          },
        }, {
          onConflict: 'analysis_batch_id,prompt_id,engine',
        });

      if (updateError) {
        console.error("[BrowserSim] Failed to store results:", updateError);
      }

      // 7. Update prompt last_checked_at
      await supabase
        .from("prompts")
        .update({ last_checked_at: new Date().toISOString() })
        .eq("id", prompt_id);

      const totalTime = Date.now() - startTime;
      
      console.log(`[BrowserSim] Complete: ${engine} for "${prompt.text.slice(0, 30)}..."`);
      console.log(`  Mode: ${result.mode}`);
      console.log(`  Visible: ${isVisible}`);
      console.log(`  Citations: ${citationCount}`);
      console.log(`  Source cards: ${sourceCardCount}`);
      console.log(`  Time: ${totalTime}ms`);

      return {
        prompt_id,
        engine,
        mode: result.mode,
        is_visible: isVisible,
        citation_count: citationCount,
        source_card_count: sourceCardCount,
        search_chip_count: searchChipCount,
        has_knowledge_panel: hasKnowledgePanel,
        response_time_ms: result.browser_time_ms || result.total_time_ms,
        total_time_ms: totalTime,
        success: true,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[BrowserSim] Failed: ${engine} - ${errorMsg}`);

      // Store error in simulation record
      await supabase
        .from("simulations")
        .upsert({
          brand_id,
          prompt_id,
          analysis_batch_id,
          engine,
          language,
          region,
          status: "failed",
          error_message: errorMsg,
        }, {
          onConflict: 'analysis_batch_id,prompt_id,engine',
        });

      return {
        prompt_id,
        engine,
        mode,
        is_visible: false,
        citation_count: 0,
        source_card_count: 0,
        search_chip_count: 0,
        has_knowledge_panel: false,
        response_time_ms: 0,
        total_time_ms: Date.now() - startTime,
        success: false,
        error_message: errorMsg,
      };
    } finally {
      // Cleanup browser pool for this task
      // Note: In production, you might want to keep the pool alive across tasks
      // await shutdownBrowserPool();
    }
  },
});

// ===========================================
// Batch Browser Simulation Task
// ===========================================

export interface BatchBrowserSimulationInput {
  brand_id: string;
  prompt_ids: string[];
  analysis_batch_id: string;
  engines: SupportedEngine[];
  language: SupportedLanguage;
  region: SupportedRegion;
  mode: BrowserSimulationMode;
}

export const batchBrowserSimulationTask = task({
  id: "batch-browser-simulation",
  maxDuration: 600, // 10 minutes max (reduced from 30 - parallelism makes it faster)
  retry: {
    maxAttempts: 1,
  },
  // Use queue for concurrency control
  queue: {
    concurrencyLimit: 3, // Max 3 batch browser jobs at once
  },

  run: async (payload: BatchBrowserSimulationInput) => {
    const {
      brand_id,
      prompt_ids,
      analysis_batch_id,
      engines,
      language,
      region,
      mode,
    } = payload;

    const totalSimulations = prompt_ids.length * engines.length;
    console.log(`[BatchBrowserSim] Starting PARALLEL batch: ${prompt_ids.length} prompts x ${engines.length} engines = ${totalSimulations} simulations`);

    // ═══════════════════════════════════════════════════════════════
    // PARALLEL EXECUTION - Run all simulations simultaneously
    // ═══════════════════════════════════════════════════════════════
    
    // Build all payloads
    const simulationPayloads = [];
    for (const prompt_id of prompt_ids) {
      for (const engine of engines) {
        simulationPayloads.push({
          payload: {
            brand_id,
            prompt_id,
            analysis_batch_id,
            engine,
            language,
            region,
            mode,
          },
        });
      }
    }

    const startTime = Date.now();
    
    // Execute ALL simulations in parallel
    const batchResults = await runBrowserSimulationTask.batchTriggerAndWait(simulationPayloads);
    
    const duration = Date.now() - startTime;
    const runResults = batchResults.runs || [];
    console.log(`[BatchBrowserSim] All ${runResults.length} simulations completed in ${Math.round(duration / 1000)}s`);

    // Process results
    const results: BrowserSimulationOutput[] = [];
    
    for (let i = 0; i < runResults.length; i++) {
      const result = runResults[i];
      const payload = simulationPayloads[i].payload;
      
      if (result.ok) {
        results.push(result.output);
      } else {
        console.error(`[BatchBrowserSim] Failed: ${payload.engine}/${payload.prompt_id}:`, result.error);
        results.push({
          prompt_id: payload.prompt_id,
          engine: payload.engine,
          mode,
          is_visible: false,
          citation_count: 0,
          source_card_count: 0,
          search_chip_count: 0,
          has_knowledge_panel: false,
          response_time_ms: 0,
          total_time_ms: 0,
          success: false,
          error_message: 'Task execution failed',
        });
      }
    }

    // Cleanup browser pool after batch
    await shutdownBrowserPool();

    const successCount = results.filter(r => r.success).length;
    const avgTime = Math.round(duration / totalSimulations);

    console.log(`[BatchBrowserSim] Complete: ${successCount}/${totalSimulations} successful (${avgTime}ms avg per simulation)`);

    return {
      total: totalSimulations,
      successful: successCount,
      failed: totalSimulations - successCount,
      duration_ms: duration,
      avg_time_per_simulation_ms: avgTime,
      results,
    };
  },
});

// ===========================================
// Helper Functions
// ===========================================

function checkBrandVisibility(
  response: string,
  brandDomain: string,
  brandName: string,
  brandAliases: string[]
): boolean {
  const responseLower = response.toLowerCase();
  
  // Check domain
  if (responseLower.includes(brandDomain.toLowerCase())) {
    return true;
  }
  
  // Check brand name
  if (brandName && responseLower.includes(brandName.toLowerCase())) {
    return true;
  }
  
  // Check domain without TLD
  const domainWithoutTLD = brandDomain.replace(/\.(com|ae|co|net|org|io).*$/i, "");
  if (domainWithoutTLD.length > 3 && responseLower.includes(domainWithoutTLD.toLowerCase())) {
    return true;
  }
  
  // Check aliases
  for (const alias of brandAliases) {
    if (alias.length > 2 && responseLower.includes(alias.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

