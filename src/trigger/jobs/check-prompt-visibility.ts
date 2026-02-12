/**
 * Job: check-prompt-visibility
 * 
 * The atomic unit of analysis - runs a single simulation
 * (one engine + one prompt + one language) and stores results.
 * 
 * OPTIMIZED for PARALLEL EXECUTION:
 * - Queue-based concurrency control prevents API rate limits
 * - Per-engine queues allow maximum parallelism per AI provider
 * - Fast execution path with minimal blocking operations
 * 
 * ENHANCED with:
 * - ENSEMBLE SIMULATION: Multiple runs aggregated for high-recall brand detection
 * - DEDICATED BRAND EXTRACTOR: Separates answer generation from brand detection
 * - PROBABILITY-BASED RESULTS: Reports confidence, not absolute claims
 * - Native API grounding for each engine
 * - Entity Confidence checking
 * - Enhanced sentiment analysis
 * - Citation authority mapping
 * - Schema fix generation
 */

import { task, queue, tasks } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { 
  runEnsembleSimulation,
  runSingleSimulationWithExtraction,
} from "@/lib/ai/ensemble-simulation";
import { thoroughVisibilityCheck } from "@/lib/ai/selection-signals";
import { textToSafeHtml } from "@/lib/ai/text-to-html";
import { replacePlaceholders, hasPlaceholders } from "@/lib/ai/placeholder-replacer";
import type { GroundTruthData } from "@/lib/ai/hallucination-detector";
import type { CrawlAnalysis } from "@/lib/ai/crawl-analyzer";
import { 
  ENSEMBLE_RUN_COUNT, 
  DEFAULT_BROWSER_SIMULATION_MODE,
  type BrowserSimulationMode,
} from "@/lib/ai/openai-config";
import { SIMULATION_PIPELINE_VERSION, VISIBILITY_CONTRACT_VERSION } from "@/lib/ai/versions";
import { withLogContext, createRequestId } from "@/lib/logging/logger";
import type { 
  CheckVisibilityInput, 
  SupportedEngine, 
  SupportedLanguage, 
  SelectionSignals,
  CitationAuthority, 
  BrandPresenceLevel,
  EnsembleSimulationData,
  SimulationMode,
} from "@/types";

// Create Supabase client with service role for job access
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ═══════════════════════════════════════════════════════════════
// CONCURRENCY QUEUES - Prevent API rate limits while maximizing parallelism
// ═══════════════════════════════════════════════════════════════
// Each AI engine has its own queue with appropriate concurrency limits
// This allows multiple engines to run in parallel while respecting
// per-engine rate limits

// Default queue (backwards-compatible)
const simulationQueue = queue({
  name: "ai-simulations",
  concurrencyLimit: 8, // Reduced to prevent API rate limit issues (was 15)
});

// Per-engine queues (must be defined ahead of time; triggering uses queue NAME)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const chatgptQueue = queue({ name: "sim-chatgpt", concurrencyLimit: 2 }); // Reduced to prevent rate limits with ensemble runs
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const grokQueue = queue({ name: "sim-grok", concurrencyLimit: 2 }); // Reduced for rate limits
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const geminiQueue = queue({ name: "sim-gemini", concurrencyLimit: 6 });
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const perplexityQueue = queue({ name: "sim-perplexity", concurrencyLimit: 6 });

export const checkPromptVisibility = task({
  id: "check-prompt-visibility",
  maxDuration: 360, // gpt-5-nano + multi-engine runs can exceed 3 minutes in real conditions
  queue: simulationQueue, // Use shared queue for concurrency control
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 1000, // Reduced from 2000
    maxTimeoutInMs: 8000, // Reduced from 10000
  },

  run: async (payload: CheckVisibilityInput, { ctx }) => {
    // Support both prompt_id (new) and keyword_id (legacy) for backwards compatibility
    const prompt_id = payload.prompt_id || payload.keyword_id;
    const { 
      brand_id, 
      analysis_batch_id, 
      engine, 
      language,
      region = "global", 
      enable_hallucination_watchdog,
      simulation_mode = DEFAULT_BROWSER_SIMULATION_MODE,
      ensemble_run_count,
      enable_variance_metrics = false,
    } = payload;
    const effectiveLanguage = ((language || "en") as SupportedLanguage);
    const supabase = getSupabase();
    const request_id = createRequestId();
    const logger = withLogContext({
      request_id,
      task: "check-prompt-visibility",
      engine,
      brand_id,
      analysis_batch_id,
      prompt_id,
    });

    // IMPORTANT: This task triggers additional child tasks (enrichment + finalization) using trigger() (non-wait).
    // In that mode, Trigger does NOT automatically version-lock the children to this run. Explicitly lock them.
    const childVersion = ctx.run.version ?? ctx.deployment?.version;
    
    // Log simulation mode for visibility
    const modeLabel = simulation_mode === 'api' ? 'API' 
      : simulation_mode === 'browser' ? 'Browser (Playwright)' 
      : simulation_mode === 'rpa' ? 'RPA (External)' 
      : 'Hybrid';
    logger.info("Starting simulation", { mode: modeLabel });

    // 1. Fetch brand details (minimal fields only)
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("id, name, domain, brand_aliases, settings, last_crawled_at, ground_truth_summary, organizations(id)")
      .eq("id", brand_id)
      .single();

    if (brandError || !brand) {
      throw new Error(`Brand not found: ${brand_id}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _organization = Array.isArray(brand.organizations)
      ? brand.organizations[0]
      : brand.organizations;

    // 3. Replace placeholders in prompt text with brand context
    let promptText: string | undefined = payload.prompt_text;
    if (!promptText) {
      // Only fetch prompt text if it wasn't passed in (perf optimization)
      const { data: prompt, error: promptError } = await supabase
        .from("prompts")
        .select("id, text")
        .eq("id", prompt_id)
        .single();

      if (promptError || !prompt) {
        throw new Error(`Prompt not found: ${prompt_id}`);
      }

      promptText = prompt.text;
    }
    if (promptText && hasPlaceholders(promptText)) {
      const originalPrompt = promptText;
      const settings = brand.settings as Record<string, unknown> || {};
      promptText = replacePlaceholders(promptText, {
        name: brand.name,
        domain: brand.domain,
        aliases: brand.brand_aliases || [],
        description: settings.product_description as string || undefined,
        category: settings.category as string || undefined,
        industry: settings.industry as string || undefined,
        target_audience: settings.target_audience as string || undefined,
        competitors: settings.competitors as string[] || undefined,
      });
      console.log(`Replaced placeholders: "${originalPrompt}" -> "${promptText}"`);
    }
    if (!promptText) {
      throw new Error(`Prompt text missing for prompt_id: ${prompt_id}`);
    }

    // 3.5. Ground truth (fast path)
    // Avoid per-simulation DB reads of crawled_pages (expensive and duplicated across engines).
    // Prefer using structured ground truth stored on the brand record.
    let groundTruthContent: string | undefined;
    let structuredGroundTruth: GroundTruthData | undefined;
    
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
        raw_content: "",
        crawled_pages: [],
      };

      // Build a compact “ground truth” string from structured data only (fast + stable)
      const parts: string[] = [];
      if (structuredGroundTruth.tagline) parts.push(`Tagline: ${structuredGroundTruth.tagline}`);
      if (structuredGroundTruth.company_description) parts.push(`Description: ${structuredGroundTruth.company_description}`);
      if (structuredGroundTruth.products?.length) parts.push(`Products: ${structuredGroundTruth.products.slice(0, 12).join(", ")}`);
      if (structuredGroundTruth.services?.length) parts.push(`Services: ${structuredGroundTruth.services.slice(0, 12).join(", ")}`);
      if (structuredGroundTruth.features?.length) parts.push(`Features: ${structuredGroundTruth.features.slice(0, 20).join(", ")}`);
      if (structuredGroundTruth.pricing?.length) {
        parts.push(
          `Pricing: ${structuredGroundTruth.pricing
            .slice(0, 6)
            .map(p => `${p.plan_name}: ${p.price}${p.is_free ? " (free)" : ""}`)
            .join(" | ")}`
        );
      }
      if (structuredGroundTruth.locations?.length) parts.push(`Locations: ${structuredGroundTruth.locations.slice(0, 10).join(", ")}`);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      groundTruthContent = parts.join("\n");
      console.log(`Loaded structured ground truth: ${structuredGroundTruth.pricing?.length || 0} pricing, ${structuredGroundTruth.features?.length || 0} features`);
    }

    // 4. Upsert simulation record (idempotent across retries / concurrent triggers)
    // Requires unique constraint: (analysis_batch_id, prompt_id, engine)
    //
    // IMPORTANT: During rollout, Supabase/PostgREST schema cache may not yet include new columns.
    // We fallback to an upsert without stage/enrichment columns to avoid failing runs.
    const baseUpsert = {
      brand_id,
      prompt_id,
      analysis_batch_id,
      engine,
      language,
      region,
      prompt_text: promptText, // Use the processed prompt with placeholders replaced
      status: simulation_mode === "rpa" ? "awaiting_rpa" : "processing",
    } as Record<string, unknown>;

    const upsertWithStage = {
      ...baseUpsert,
      analysis_stage: `simulating:${engine}`,
      enrichment_status: "queued",
    };

    let simulationId: string;
    {
      const { data: simulation, error: simError } = await supabase
        .from("simulations")
        .upsert(upsertWithStage, { onConflict: "analysis_batch_id,prompt_id,engine" })
        .select("id")
        .single();

      if (!simError && simulation?.id) {
        simulationId = simulation.id;
      } else {
        const msg = simError?.message || "";
        const isSchemaCacheMissing =
          msg.includes("schema cache") &&
          (msg.includes("analysis_stage") || msg.includes("enrichment_status"));

        if (!isSchemaCacheMissing) {
          throw new Error(`Failed to upsert simulation: ${simError?.message}`);
        }

        // Fallback upsert without new columns
        const { data: fallbackSim, error: fallbackErr } = await supabase
          .from("simulations")
          .upsert(baseUpsert, { onConflict: "analysis_batch_id,prompt_id,engine" })
          .select("id")
          .single();

        if (fallbackErr || !fallbackSim?.id) {
          throw new Error(`Failed to upsert simulation: ${fallbackErr?.message}`);
        }

        simulationId = fallbackSim.id;
      }
    }

    // ===========================================
    // RPA MODE: Create record and exit early
    // ===========================================
    // When using RPA mode, we don't run any automation here.
    // The external Python RPA script will:
    // 1. Run the prompt in a real headed Chrome browser
    // 2. Send results to /api/analysis/rpa-ingest
    // 3. That endpoint stores results and runs analysis
    if (simulation_mode === 'rpa') {
      console.log(`[RPA Mode] Simulation ${simulationId} created with status 'awaiting_rpa'`);
      console.log(`[RPA Mode] Run the Python RPA script to complete this simulation:`);
      console.log(`  cd rpa && python main.py --csv prompts.csv --engine ${engine}`);

      // IMPORTANT: Seed selection_signals for RPA so downstream jobs (rpa-ingest + analyze-rpa-simulation)
      // can correctly determine whether Hallucination Watchdog should run.
      // Without this, rpa-ingest defaults watchdog to disabled and non-ChatGPT engines never run it.
      try {
        await supabase
          .from("simulations")
          .update({
            selection_signals: {
              source: "rpa_seed",
              analysis_pending: true,
              hallucination_watchdog: {
                enabled: enable_hallucination_watchdog === true,
                result: null,
              },
            },
          })
          .eq("id", simulationId);
      } catch {
        // best-effort
      }
      
      // Update batch progress (we count RPA as "submitted" not "completed")
      // The webhook will handle final completion
      
      return {
        prompt_id,
        keyword_id: prompt_id,
        engine,
        is_visible: false,
        presence_level: "likely_absent" as BrandPresenceLevel,
        visibility_frequency: 0,
        visibility_confidence: "low" as const,
        visibility_statement: "Awaiting RPA automation",
        ensemble_enabled: false,
        ensemble_run_count: 0,
        sentiment: "neutral",
        recommendation: "Run the external RPA script to complete this simulation",
        tiered_recommendations_count: 0,
        status: "awaiting_rpa",
      };
    }

    try {
      // 6. Run the AI simulation with ENSEMBLE approach for high-recall brand detection
      // For ChatGPT, use ensemble (multiple runs) to reduce variance and false negatives
      // For other engines, use single run with dedicated brand extraction
      // User can override ensemble run count via payload (validated to 1-15 range in ensemble-simulation.ts)
      const effectiveRunCount = ensemble_run_count ?? ENSEMBLE_RUN_COUNT;
      const useEnsemble = engine === 'chatgpt' && effectiveRunCount > 1;
      
      console.log(`Running ${useEnsemble ? 'ensemble' : 'single'} simulation for "${promptText}" on ${engine} (region: ${region})`);
      
      // Prepare target brand info for brand extractor
      const targetBrand = {
        name: brand.name,
        domain: brand.domain,
        aliases: brand.brand_aliases || [],
      };
      
      let simulationResult;
      let ensembleData: EnsembleSimulationData | undefined;
      let visibilityFrequency = 0;
      let presenceLevel: BrandPresenceLevel = "likely_absent";
      let visibilityConfidence: "high" | "medium" | "low" = "low";
      
      if (useEnsemble) {
        // ENSEMBLE MODE: Multiple runs aggregated for accuracy
        console.log(`[Ensemble] Running ${effectiveRunCount} simulations for high-recall brand detection (mode: ${modeLabel})...`);
        
        const ensembleResult = await runEnsembleSimulation({
          engine: engine as SupportedEngine,
          keyword: promptText,
          language: effectiveLanguage,
          region,
          brand_domain: brand.domain,
          target_brand: targetBrand,
          run_count: effectiveRunCount,
          simulation_mode: simulation_mode as BrowserSimulationMode,
          enable_variance_metrics,
        });
        
        // Use representative answer for display
        simulationResult = {
          answer_html: ensembleResult.representative_answer,
          sources: ensembleResult.all_sources,
          search_context: {
            query: promptText,
            results: ensembleResult.all_sources.map((s, i) => ({
              url: s.url,
              title: s.title || "",
              snippet: s.snippet || "",
              score: i + 1,
            })),
          },
        };
        
        // Extract ensemble metrics
        if (ensembleResult.target_brand_result) {
          visibilityFrequency = ensembleResult.target_brand_result.visibility_frequency;
          presenceLevel = ensembleResult.target_brand_result.presence_level;
          visibilityConfidence = ensembleResult.target_brand_result.confidence;
        }
        
        // Build ensemble data for storage
        ensembleData = {
          enabled: true,
          run_count: ensembleResult.total_runs,
          successful_runs: ensembleResult.successful_runs,
          target_visibility: ensembleResult.target_brand_result ? {
            is_visible: ensembleResult.target_brand_result.visibility_frequency >= 0.2,
            visibility_frequency: ensembleResult.target_brand_result.visibility_frequency,
            presence_level: ensembleResult.target_brand_result.presence_level,
            confidence: ensembleResult.target_brand_result.confidence,
            mentioned_in_runs: ensembleResult.target_brand_result.mentioned_in_runs,
            supported_in_runs: ensembleResult.target_brand_result.supported_in_runs,
            total_runs: ensembleResult.target_brand_result.total_runs,
            summary: ensembleResult.target_brand_result.summary,
          } : undefined,
          all_brands: ensembleResult.all_brands.slice(0, 20).map(b => ({
            name: b.name,
            domain: b.domain,
            frequency: b.frequency,
            presence_level: b.presence_level,
            mention_frequency: b.mention_frequency,
            source_frequency: b.source_frequency,
            confidence: b.frequency >= 0.6 ? "high" : b.frequency >= 0.3 ? "medium" : "low",
          })),
          brand_variance: ensembleResult.variance_metrics?.brand_variance ?? 0,
          notes: ensembleResult.notes,
          // Include variance metrics when enabled
          variance_metrics: ensembleResult.variance_metrics ? {
            run_count: ensembleResult.total_runs,
            successful_runs: ensembleResult.successful_runs,
            brand_variance: ensembleResult.variance_metrics.brand_variance,
            confidence_interval: ensembleResult.variance_metrics.confidence_interval,
            statistical_significance: ensembleResult.variance_metrics.statistical_significance,
            p_value: ensembleResult.variance_metrics.p_value,
            standard_error: ensembleResult.variance_metrics.standard_error,
          } : undefined,
        };
        
        console.log(`[Ensemble] Complete: ${ensembleResult.successful_runs}/${ensembleResult.total_runs} runs`);
        console.log(`[Ensemble] Target brand "${brand.name}": ${presenceLevel} (${Math.round(visibilityFrequency * 100)}%)`);
        
      } else {
        // SINGLE MODE with dedicated brand extraction
        const singleResult = await runSingleSimulationWithExtraction({
          engine: engine as SupportedEngine,
          keyword: promptText,
          language: effectiveLanguage,
          region,
          brand_domain: brand.domain,
          target_brand: targetBrand,
          simulation_mode: simulation_mode as BrowserSimulationMode,
        });
        
        simulationResult = singleResult.simulation;
        
        if (singleResult.target_visibility) {
          visibilityFrequency = singleResult.target_visibility.is_visible ? 1 : 0;
          presenceLevel = singleResult.target_visibility.is_visible ? "definite_present" : "likely_absent";
          visibilityConfidence = singleResult.target_visibility.confidence;
        }
        
        console.log(`Got response from ${engine}, analyzing...`);
      }

      // 7. Thorough visibility check (checks brand name, domain, aliases, and variations)
      // This is now supplementary to the ensemble/extractor results
      const visibilityCheck = thoroughVisibilityCheck(
        simulationResult.answer_html,
        brand.domain,
        brand.brand_aliases || [],
        brand.name // Pass brand name for better detection
      );
      
    logger.info("Visibility check", { visible: visibilityCheck.isVisible, mentions: visibilityCheck.mentions });
      
      // If ensemble says possible but simple check says visible, upgrade confidence
      if (ensembleData && visibilityCheck.isVisible && presenceLevel === "possible_present") {
        console.log(`Upgrading presence level: simple check confirms visibility`);
      }

      // 8. Queue heavy analysis asynchronously (selection signals + AEO + optional watchdog)
      // Best-effort stage updates (safe during schema cache rollout)
      try {
        await supabase
          .from("simulations")
          .update({
            analysis_stage: `enrichment_queued:${engine}`,
            enrichment_status: "queued",
          })
          .eq("id", simulationId);
      } catch {
        // best-effort during schema rollout
      }

      await tasks.trigger(
        "enrich-simulation",
        { simulation_id: simulationId, enable_hallucination_watchdog },
        {
          idempotencyKey: `enrich-${simulationId}`,
          ...(childVersion ? { version: childVersion } : {}),
        }
      );

      // 9. Citation Authority Mapping (cheap, keep in core path)
      let citationAuthorities: CitationAuthority[] = [];
      
      if (simulationResult.standardized?.sources) {
        citationAuthorities = simulationResult.standardized.sources.map(source => ({
          domain: source.domain,
          authority_score: source.authority_score || 50,
          tier: source.authority_tier || 'medium',
          source_type: source.source_type || 'editorial',
          is_brand_domain: source.is_brand_match,
        }));
        const brandCitations = citationAuthorities.filter(c => c.is_brand_domain).length;
        console.log(`📚 Citation Authority: ${citationAuthorities.length} sources, ${brandCitations} brand citations`);
      }

      const enhancedSignals = {
        is_visible: visibilityCheck.isVisible,
        sentiment: visibilityCheck.isVisible ? ("neutral" as const) : ("negative" as const),
        // Keep more sources so the UI can render a complete Citation Authority Map.
        // (We still cap to avoid huge payloads.)
        winning_sources: Array.from(new Set((simulationResult.sources || []).map((s) => s.url))).slice(0, 25),
        gap_analysis: {
          structure_score: 3,
          data_density_score: 3,
          directness_score: 3,
          authority_score: 3,
          crawlability_score: 3,
        },
        recommendation: "Enriching analysis…",
        action_items: [],
        competitor_insights: "",
        quick_wins: [],
        analysis_partial: true,
      } as unknown as SelectionSignals;

      // IMPROVED VISIBILITY LOGIC:
      // 1. If ensemble mode: use presence_level from ensemble
      // 2. Fallback: use OR logic between our check and GPT analysis
      // Key insight: we report PROBABILITY, not absolute claims
      let isVisible: boolean;
      let visibilityStatement: string;
      
      if (ensembleData?.target_visibility) {
        // Ensemble mode: use frequency-based visibility
        // "definite_present" or "possible_present" = visible
        isVisible = ["definite_present", "possible_present"].includes(presenceLevel);
        visibilityStatement = ensembleData.target_visibility.summary;
        
        console.log(`[Visibility] Ensemble-based: ${presenceLevel} (${Math.round(visibilityFrequency * 100)}%)`);
      } else {
        // Single mode: base visibility purely on deterministic checks (final enrichment runs async)
        isVisible = visibilityCheck.isVisible;
        visibilityStatement = isVisible 
          ? `${brand.name} was detected in the AI response`
          : `${brand.name} was not detected in the AI response`;
          
        console.log(`[Visibility] Single-run: ${isVisible ? 'VISIBLE' : 'NOT VISIBLE'}`);
      }

      // 11. Update simulation with results (including new enhanced fields and tiered recommendations)
      const { error: updateError } = await supabase
        .from("simulations")
        .update({
          // Store a safe HTML-rendered version for UI parity (preserves lists/newlines)
          ai_response_html: textToSafeHtml(simulationResult.answer_html),
          search_context: simulationResult.search_context || null,
          is_visible: isVisible,
          sentiment: enhancedSignals.sentiment,
          selection_signals: {
            ...enhancedSignals,
            // NEW: Ensemble and presence data
            ensemble_data: ensembleData || null,
            presence_level: presenceLevel,
            visibility_confidence: visibilityConfidence,
            visibility_frequency: visibilityFrequency,
            visibility_statement: visibilityStatement,
            visibility_contract_version: VISIBILITY_CONTRACT_VERSION,
            simulation_pipeline_version: SIMULATION_PIPELINE_VERSION,
            meta: {
              engine,
              provider: "api",
              model:
                engine === "chatgpt" ? "openai" :
                engine === "gemini" ? "gemini-2.0-flash" :
                engine === "grok" ? "grok-4-1-fast-reasoning" :
                engine === "perplexity" ? "sonar-pro" :
                undefined,
              simulation_mode: simulation_mode as SimulationMode,
            },
            visibility: {
              visible_in_text: visibilityCheck.mentions.length > 0,
              visible_in_sources: citationAuthorities.some((c) => c.is_brand_domain),
              visible_probability: ensembleData?.target_visibility?.visibility_frequency ?? (isVisible ? 1 : 0),
              reason: visibilityCheck.mentions.length > 0 ? "mentioned_in_text" : citationAuthorities.some((c) => c.is_brand_domain) ? "cited_in_sources" : isVisible ? "detected" : "absent",
            },
          },
          status: "completed",
          error_message: null,
          // NEW: Enhanced fields
          standardized_result: (simulationResult as { standardized?: unknown }).standardized || null,
          sentiment_analysis: null,
          net_sentiment_score: null,
          grounding_metadata: simulationResult.search_context?.grounding_metadata || null,
          citation_authorities: citationAuthorities.length > 0 ? citationAuthorities : null,
          // Best-effort: these columns may not exist yet (schema cache rollout)
          analysis_stage: `simulated:${engine}`,
          enrichment_status: "queued",
        })
        .eq("id", simulationId);

      if (updateError) {
        console.error("Failed to update simulation:", updateError);
      }

      // Update prompt last_checked_at (best-effort)
      try {
        await supabase
          .from("prompts")
          .update({ last_checked_at: new Date().toISOString() })
          .eq("id", prompt_id);
      } catch {
        // ignore
      }

      // Increment batch progress (best-effort). This makes the parent orchestration non-blocking.
      try {
        await supabase.rpc("increment_batch_completed", { batch_id: analysis_batch_id });
      } catch {
        // ignore (RPC may not exist in some environments)
      }

      logger.info("Simulation completed", {
        visible: isVisible,
        presenceLevel,
        visibilityFrequency,
        visibilityStatement,
      });

      return {
        prompt_id,
        keyword_id: prompt_id, // For backwards compatibility
        engine,
        is_visible: isVisible,
        // NEW: Probability-based visibility reporting
        presence_level: presenceLevel,
        visibility_frequency: visibilityFrequency,
        visibility_confidence: visibilityConfidence,
        visibility_statement: visibilityStatement,
        // Ensemble metrics (if used)
        ensemble_enabled: ensembleData?.enabled || false,
        ensemble_run_count: ensembleData?.run_count || 1,
        // Standard fields
        sentiment: enhancedSignals.sentiment,
        recommendation: enhancedSignals.recommendation,
        tiered_recommendations_count: enhancedSignals.tiered_recommendations?.length || 0,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("Simulation failed", { error: errorMsg });
      
      // Update simulation as failed
      await supabase
        .from("simulations")
        .update({
          status: "failed",
          error_message: errorMsg,
          enrichment_status: "failed",
          enrichment_error: errorMsg,
          analysis_stage: `failed:${engine}`,
        })
        .eq("id", simulationId);

      // Count failures as completed work for batch progress (best-effort)
      try {
        await supabase.rpc("increment_batch_completed", { batch_id: analysis_batch_id });
      } catch {
        // ignore
      }

      // Kick finalization debounce so batch can complete once all enrichment is done/failed
      try {
        await tasks.trigger(
          "finalize-analysis-batch",
          { analysis_batch_id },
          {
            debounce: {
              key: `finalize-${analysis_batch_id}`,
              delay: "5s",
              mode: "trailing",
            },
            ...(childVersion ? { version: childVersion } : {}),
          }
        );
      } catch {
        // ignore
      }

      throw error;
    }
  },
});

// ===========================================
// AUTO-CRAWL HELPER
// ===========================================

/**
 * Trigger website crawl if no crawl data exists.
 * Uses a lightweight "quick crawl" approach (10 pages) for fast actionable recommendations.
 * 
 * Returns crawl analysis if successful, null otherwise.
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
      console.log(`   ℹ️ Found existing completed crawl from ${existingCrawl.completed_at}`);
      
      // Re-fetch brand to get crawl analysis (it might have been updated since we fetched)
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
      console.log(`   ⏳ Crawl already in progress (${inProgressCrawl.status})`);
      return null;
    }
    
    // Trigger a quick crawl (10 pages, depth 2 for speed)
    console.log(`   🕷️ Triggering auto-crawl for ${brand.domain}...`);
    
    // Construct start URL
    let startUrl = brand.domain;
    if (!startUrl.startsWith("http://") && !startUrl.startsWith("https://")) {
      startUrl = `https://${startUrl}`;
    }
    
    // Create crawl job record
    const { data: crawlJob, error: createError } = await supabase
      .from("crawl_jobs")
      .insert({
        brand_id: brandId,
        status: "pending",
        start_url: startUrl,
        max_pages: 10, // Quick crawl - just enough for actionable recommendations
        max_depth: 2,
        include_paths: [],
        exclude_paths: [],
      })
      .select()
      .single();
    
    if (createError || !crawlJob) {
      console.error(`   ✗ Failed to create crawl job:`, createError);
      return null;
    }
    
    // Import and trigger the crawl task
    const { tasks } = await import("@trigger.dev/sdk/v3");
    
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
      
      console.log(`   ✓ Auto-crawl triggered (job: ${crawlJob.id})`);
      console.log(`   ℹ️ Crawl will complete in background. Re-run analysis for actionable recommendations.`);
      
    } catch (triggerError) {
      console.error(`   ✗ Failed to trigger crawl:`, triggerError);
      
      // Mark job as failed
      await supabase
        .from("crawl_jobs")
        .update({ 
          status: "failed", 
          error_message: `Auto-crawl trigger failed: ${triggerError instanceof Error ? triggerError.message : 'Unknown error'}` 
        })
        .eq("id", crawlJob.id);
    }
    
    return null; // Crawl is async, results won't be available immediately
    
  } catch (error) {
    console.error(`   ✗ Auto-crawl error:`, error);
    return null;
  }
}