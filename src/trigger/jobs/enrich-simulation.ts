import { task, queue, tasks } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import type { SearchContext, SupportedEngine } from "@/types";
import { analyzeSelectionSignals, enhanceWithTieredRecommendations, extractQuickWins } from "@/lib/ai/selection-signals";
import { calculateAEOScore } from "@/lib/ai/aeo-scoring";
import { analyzeSentiment } from "@/lib/ai/sentiment-analyzer";
import { verifyCompetitors, hasLikelyCompetitors } from "@/lib/ai/competitor-verifier";
import { generateSchemaFix } from "@/lib/ai/schema-generator";
import {
  detectHallucinations,
  detectNegativeHallucination,
  type GroundTruthData,
  type HallucinationResult,
  type DetectedHallucination,
} from "@/lib/ai/hallucination-detector";
import type { CrawlAnalysis } from "@/lib/ai/crawl-analyzer";
import { ENRICHMENT_PIPELINE_VERSION, VISIBILITY_CONTRACT_VERSION } from "@/lib/ai/versions";

const enrichQueue = queue({
  name: "simulation-enrichment",
  concurrencyLimit: 10,
});

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface EnrichSimulationInput {
  simulation_id: string;
  enable_hallucination_watchdog?: boolean;
}

export const enrichSimulation = task({
  id: "enrich-simulation",
  queue: enrichQueue,
  maxDuration: 360,
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: EnrichSimulationInput) => {
    const supabase = getSupabase();

    // 1) Fetch simulation + brand (minimal)
    const { data: sim, error: simErr } = await supabase
      .from("simulations")
      .select("id, brand_id, prompt_id, analysis_batch_id, engine, language, region, prompt_text, ai_response_html, search_context, is_visible, selection_signals")
      .eq("id", payload.simulation_id)
      .single();

    if (simErr || !sim) {
      throw new Error(`Simulation not found: ${payload.simulation_id}`);
    }

    const { data: brand, error: brandErr } = await supabase
      .from("brands")
      .select("id, name, domain, brand_aliases, settings, ground_truth_summary")
      .eq("id", sim.brand_id)
      .single();

    if (brandErr || !brand) {
      throw new Error(`Brand not found: ${sim.brand_id}`);
    }

    // mark enrichment started (best-effort during schema rollout)
    try {
      await supabase
        .from("simulations")
        .update({
          enrichment_status: "processing",
          enrichment_started_at: new Date().toISOString(),
          enrichment_error: null,
          analysis_stage: `enriching:${sim.engine}`,
        })
        .eq("id", sim.id);
    } catch {
      // best-effort during schema rollout
    }

    // 2) Build structured ground truth (fast path from brand.ground_truth_summary)
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

    let structuredGroundTruth: GroundTruthData | undefined;
    let groundTruthContent: string | undefined;

    if (groundTruthSummary?.structured_data) {
      structuredGroundTruth = {
        ...groundTruthSummary.structured_data,
        raw_content: "",
        crawled_pages: [],
      };

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
      groundTruthContent = parts.join("\n");
    }

    const rawSearchContext = (sim.search_context || null) as unknown as Partial<SearchContext> | null;
    const searchContext: SearchContext | null = rawSearchContext
      ? {
          query: rawSearchContext.query ?? (sim.prompt_text || ""),
          results: Array.isArray(rawSearchContext.results) ? rawSearchContext.results : [],
          grounding_metadata: rawSearchContext.grounding_metadata,
        }
      : null;

    // 3) Selection Signals (OpenAI call)
    const selectionSignals = await analyzeSelectionSignals({
      answer_html: sim.ai_response_html || "",
      answer_text: undefined,
      search_context: searchContext,
      brand_domain: brand.domain,
      brand_aliases: brand.brand_aliases || [],
      engine: sim.engine as SupportedEngine,
      keyword: sim.prompt_text || "",
    });

    // 3.5) Verify competitor insights (if present)
    const brandSettings = (brand.settings || {}) as Record<string, unknown>;
    if (selectionSignals.competitor_insights && hasLikelyCompetitors(selectionSignals.competitor_insights)) {
      try {
        const verifiedInsights = await verifyCompetitors({
          competitorInsightsText: selectionSignals.competitor_insights,
          brandName: brand.name,
          brandDomain: brand.domain,
          brandDescription: brandSettings.product_description as string | undefined,
          brandIndustry: brandSettings.industry as string | undefined,
          brandProducts: brandSettings.key_products as string[] | undefined,
        });
        
        // Update competitor insights with verified data (high-confidence only)
        if (verifiedInsights.verifiedCompetitors.length > 0) {
          const verifiedNames = verifiedInsights.verifiedCompetitors
            .filter(c => c.relationship === "direct_competitor" && c.relevanceScore >= 7)
            .map(c => c.name)
            .filter((n) => n && n.toLowerCase() !== "competitors" && n.toLowerCase() !== "competitor");
          
          // Replace original insights with verified summary
          selectionSignals.competitor_insights = verifiedInsights.summary + 
            (verifiedNames.length > 0 ? ` Verified competitors: ${verifiedNames.join(", ")}.` : "");
          
          // Store full verification data in a new field
          (selectionSignals as unknown as Record<string, unknown>).verified_competitors = verifiedInsights;
          
          console.log(`[CompetitorVerifier] Verified ${verifiedNames.length} competitors, filtered ${verifiedInsights.filteredCompetitors.length}`);
        }
      } catch (verifyError) {
        console.warn("[CompetitorVerifier] Verification failed, using original insights:", verifyError);
        // Keep original insights on error
      }
    }

    // 4) AEO score (includes AI call for accuracy/hallucination risk)
    const aeoScore = await calculateAEOScore({
      answer_html: sim.ai_response_html || "",
      brand_name: brand.name,
      brand_domain: brand.domain,
      brand_aliases: brand.brand_aliases || [],
      brand_description: brandSettings.product_description as string | undefined,
      brand_industry: brandSettings.industry as string | undefined,
      competitor_names: brandSettings.competitors as string[] | undefined,
      sources: [],
      citations: [],
      ground_truth_content: groundTruthContent,
    });

    // 4.5) Tiered engine-specific recommendations (deterministic + uses crawlAnalysis if available)
    const gtSummaryWithAnalysis = brand.ground_truth_summary as { crawl_analysis?: CrawlAnalysis } | null;
    const crawlAnalysis = gtSummaryWithAnalysis?.crawl_analysis;
    const enhancedSignals = enhanceWithTieredRecommendations({
      selectionSignals,
      brandName: brand.name,
      brandDomain: brand.domain,
      query: sim.prompt_text || "",
      engine: sim.engine as SupportedEngine,
      crawlAnalysis,
    });

    const quickWins = enhancedSignals.tiered_recommendations
      ? extractQuickWins(enhancedSignals.tiered_recommendations)
      : [];
    if (quickWins.length > 0) {
      enhancedSignals.quick_wins = quickWins;
    }

    // 5) Optional sentiment (only meaningful when visible)
    let sentimentAnalysis: unknown = null;
    let netSentimentScore: number | null = null;
    if (sim.is_visible) {
      try {
        const sentiment = await analyzeSentiment(sim.ai_response_html || "", brand.name);
        sentimentAnalysis = sentiment;
        netSentimentScore = sentiment.net_sentiment_score;
      } catch {
        // ignore
      }
    }

    // 6) Hallucination watchdog
    let hallucinationResult: HallucinationResult | undefined;
    let hallucinationNoGroundTruth = false;
    if (payload.enable_hallucination_watchdog && sim.is_visible) {
      if (!structuredGroundTruth) {
        hallucinationNoGroundTruth = true;
      } else {
        hallucinationResult = await detectHallucinations(
          sim.ai_response_html || "",
          structuredGroundTruth,
          brand.name,
          brand.domain
        );

      const negativeHallucination = detectNegativeHallucination(sim.ai_response_html || "", structuredGroundTruth);
      if (negativeHallucination) {
        hallucinationResult.hallucinations.push(negativeHallucination);
        hallucinationResult.has_hallucinations = true;
      }

        if (hallucinationResult.has_hallucinations) {
        const enhancedActionItems = hallucinationResult.hallucinations.map((h: DetectedHallucination) => {
          const schemaFix = generateSchemaFix(
            h,
            {
              name: brand.name,
              domain: brand.domain,
              description: brandSettings.product_description as string,
              industry: brandSettings.industry as string,
              services: structuredGroundTruth?.services,
              products: structuredGroundTruth?.products,
              pricing: structuredGroundTruth?.pricing,
            },
            structuredGroundTruth
          );
          if (schemaFix) {
            h.recommendation.schema_fix = schemaFix;
          }
          return {
            priority: (h.severity === "critical" ? "high" : h.severity === "major" ? "medium" : "foundational"),
            category: "content" as const,
            title: h.recommendation.title,
            description: h.recommendation.description,
            steps: [h.recommendation.specific_fix],
          };
        });
        selectionSignals.action_items = [
          ...(enhancedActionItems as unknown as NonNullable<typeof selectionSignals.action_items>),
          ...(selectionSignals.action_items || []),
        ];
      }
      }
    }

    // 7) Persist enrichment
    // Persist enrichment. If new columns don't exist yet, still write selection_signals.
    const updateWithStages = {
      selection_signals: {
        ...(sim.selection_signals as Record<string, unknown>),
        ...enhancedSignals,
        aeo_score: aeoScore,
        sentiment_analysis: sentimentAnalysis,
        net_sentiment_score: netSentimentScore,
        enrichment_pipeline_version: ENRICHMENT_PIPELINE_VERSION,
        visibility_contract_version: VISIBILITY_CONTRACT_VERSION,
        hallucination_watchdog: payload.enable_hallucination_watchdog
          ? hallucinationResult
            ? { enabled: true, result: hallucinationResult, no_ground_truth: false }
            : { enabled: true, result: null, no_ground_truth: hallucinationNoGroundTruth }
          : { enabled: false, result: null, no_ground_truth: false },
      },
      enrichment_status: "completed",
      enrichment_completed_at: new Date().toISOString(),
      analysis_stage: "completed",
    } as Record<string, unknown>;

    const { error: writeErr } = await supabase
      .from("simulations")
      .update(updateWithStages)
      .eq("id", sim.id);

    if (writeErr) {
      const msg = writeErr.message || "";
      const isSchemaCacheMissing =
        msg.includes("schema cache") &&
        (msg.includes("analysis_stage") ||
          msg.includes("enrichment_status") ||
          msg.includes("enrichment_started_at") ||
          msg.includes("enrichment_completed_at") ||
          msg.includes("enrichment_error"));

      if (!isSchemaCacheMissing) throw new Error(writeErr.message);

      const { error: fallbackWriteErr } = await supabase
        .from("simulations")
        .update({ selection_signals: updateWithStages.selection_signals })
        .eq("id", sim.id);
      if (fallbackWriteErr) throw new Error(fallbackWriteErr.message);
    }

    // 8) Debounced batch finalization
    await tasks.trigger(
      "finalize-analysis-batch",
      { analysis_batch_id: sim.analysis_batch_id },
      {
        debounce: {
          key: `finalize-${sim.analysis_batch_id}`,
          delay: "5s",
          mode: "trailing",
        },
      }
    );

    return { ok: true };
  },
});


