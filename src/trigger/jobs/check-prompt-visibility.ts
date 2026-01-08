/**
 * Job: check-prompt-visibility
 * 
 * The atomic unit of analysis - runs a single simulation
 * (one engine + one prompt + one language) and stores results.
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

import { task } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { runSimulation } from "@/lib/ai/factory";
import { 
  runEnsembleSimulation,
  runSingleSimulationWithExtraction,
} from "@/lib/ai/ensemble-simulation";
import { 
  extractBrands,
  checkBrandVisibility,
} from "@/lib/ai/brand-extractor";
import { 
  analyzeSelectionSignals, 
  thoroughVisibilityCheck,
  enhanceWithTieredRecommendations,
  extractQuickWins,
} from "@/lib/ai/selection-signals";
import { calculateAEOScore } from "@/lib/ai/aeo-scoring";
import { textToSafeHtml } from "@/lib/ai/text-to-html";
import { replacePlaceholders, hasPlaceholders } from "@/lib/ai/placeholder-replacer";
import { 
  detectHallucinations, 
  detectNegativeHallucination,
  type GroundTruthData,
  type HallucinationResult,
} from "@/lib/ai/hallucination-detector";
import { analyzeSentiment } from "@/lib/ai/sentiment-analyzer";
import { generateSchemaFix } from "@/lib/ai/schema-generator";
import { ENSEMBLE_RUN_COUNT } from "@/lib/ai/openai-config";
import type { 
  CheckVisibilityInput, 
  SupportedEngine, 
  SupportedLanguage, 
  CitationAuthority, 
  DetectedHallucination, 
  ActionItem,
  BrandPresenceLevel,
  EnsembleSimulationData,
} from "@/types";
import type { CrawlAnalysis } from "@/lib/ai/crawl-analyzer";

// Create Supabase client with service role for job access
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const checkPromptVisibility = task({
  id: "check-prompt-visibility",
  maxDuration: 300, // 5 minutes max per simulation (SerpAPI + AI can be slow)
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 10000,
  },

  run: async (payload: CheckVisibilityInput) => {
    // Support both prompt_id (new) and keyword_id (legacy) for backwards compatibility
    const prompt_id = payload.prompt_id || payload.keyword_id;
    const { brand_id, analysis_batch_id, engine, language, region = "global", enable_hallucination_watchdog } = payload;
    const supabase = getSupabase();

    console.log(`Running simulation: ${engine} for prompt ${prompt_id}`);

    // 1. Fetch brand details
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("*, organizations(*)")
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

    const organization = brand.organizations;

    // 3. Replace placeholders in prompt text with brand context
    let promptText = prompt.text;
    if (hasPlaceholders(promptText)) {
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

    // 3.5. Fetch ground truth content from crawled pages (if available)
    let groundTruthContent: string | undefined;
    let structuredGroundTruth: GroundTruthData | undefined;
    
    if (brand.last_crawled_at) {
      const { data: crawledPages } = await supabase
        .from("crawled_pages")
        .select("title, content_excerpt, url")
        .eq("brand_id", brand_id)
        .order("created_at", { ascending: false })
        .limit(15); // Get top 15 pages for ground truth

      if (crawledPages && crawledPages.length > 0) {
        groundTruthContent = crawledPages
          .map(page => `## ${page.title || page.url}\n${page.content_excerpt || ""}`)
          .join("\n\n---\n\n");
        console.log(`Loaded ground truth from ${crawledPages.length} crawled pages`);
        
        // Load structured ground truth from brand settings
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
          console.log(`Loaded structured ground truth: ${structuredGroundTruth.pricing?.length || 0} pricing, ${structuredGroundTruth.features?.length || 0} features`);
        }
      }
    }

    // 4. Check if simulation already exists, create if not
    let simulation = await supabase
      .from("simulations")
      .select("id")
      .eq("analysis_batch_id", analysis_batch_id)
      .eq("prompt_id", prompt_id)
      .eq("engine", engine)
      .single();

    if (!simulation.data) {
      // Create the simulation record
      const { data: newSim, error: createError } = await supabase
        .from("simulations")
        .insert({
          brand_id,
          prompt_id,
          analysis_batch_id,
          engine,
          language,
          region,
          prompt_text: promptText, // Use the processed prompt with placeholders replaced
          status: "processing",
        })
        .select()
        .single();

      if (createError) {
        throw new Error(`Failed to create simulation: ${createError.message}`);
      }
      simulation = { data: newSim, error: null, count: null, status: 200, statusText: "OK" };
    } else {
      // Update to processing
      await supabase
        .from("simulations")
        .update({ status: "processing" })
        .eq("id", simulation.data.id);
    }

    const simulationId = simulation.data.id;

    try {
      // 6. Run the AI simulation with ENSEMBLE approach for high-recall brand detection
      // For ChatGPT, use ensemble (multiple runs) to reduce variance and false negatives
      // For other engines, use single run with dedicated brand extraction
      const useEnsemble = engine === 'chatgpt' && ENSEMBLE_RUN_COUNT > 1;
      
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
        console.log(`[Ensemble] Running ${ENSEMBLE_RUN_COUNT} simulations for high-recall brand detection...`);
        
        const ensembleResult = await runEnsembleSimulation({
          engine: engine as SupportedEngine,
          keyword: promptText,
          language: language as SupportedLanguage,
          region,
          brand_domain: brand.domain,
          target_brand: targetBrand,
          run_count: ENSEMBLE_RUN_COUNT,
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
          brand_variance: 0, // TODO: Calculate from run variance
          notes: ensembleResult.notes,
        };
        
        console.log(`[Ensemble] Complete: ${ensembleResult.successful_runs}/${ensembleResult.total_runs} runs`);
        console.log(`[Ensemble] Target brand "${brand.name}": ${presenceLevel} (${Math.round(visibilityFrequency * 100)}%)`);
        
      } else {
        // SINGLE MODE with dedicated brand extraction
        const singleResult = await runSingleSimulationWithExtraction({
          engine: engine as SupportedEngine,
          keyword: promptText,
          language: language as SupportedLanguage,
          region,
          brand_domain: brand.domain,
          target_brand: targetBrand,
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
      
      console.log(`Visibility check: ${visibilityCheck.isVisible ? 'VISIBLE' : 'NOT VISIBLE'}`, 
        visibilityCheck.mentions.length > 0 ? `Mentions: ${visibilityCheck.mentions.join(', ')}` : '');
      
      // If ensemble says possible but simple check says visible, upgrade confidence
      if (ensembleData && visibilityCheck.isVisible && presenceLevel === "possible_present") {
        console.log(`Upgrading presence level: simple check confirms visibility`);
      }

      // 8. Run full selection signal analysis
      const selectionSignals = await analyzeSelectionSignals({
        answer_html: simulationResult.answer_html,
        search_context: simulationResult.search_context || null,
        brand_domain: brand.domain,
        brand_aliases: brand.brand_aliases || [],
        engine: engine as SupportedEngine,
        keyword: promptText, // Use processed prompt
      });

      // 9. Calculate enhanced AEO score (with ground truth when available)
      const brandSettings = (brand.settings || {}) as Record<string, unknown>;
      const aeoScore = await calculateAEOScore({
        answer_html: simulationResult.answer_html,
        brand_name: brand.name,
        brand_domain: brand.domain,
        brand_aliases: brand.brand_aliases || [],
        brand_description: brandSettings.product_description as string | undefined,
        brand_industry: brandSettings.industry as string | undefined,
        competitor_names: brandSettings.competitors as string[] | undefined,
        sources: simulationResult.sources || [],
        citations: simulationResult.sources?.map(s => s.url) || [],
        ground_truth_content: groundTruthContent, // Enhanced with crawled content
      });

      console.log(`AEO Score: ${aeoScore.total_score}/${59} (normalized: ${aeoScore.normalized_score}/100)`);
      console.log(`  - Brand Mention: ${aeoScore.breakdown.brand_mention.score}/${aeoScore.breakdown.brand_mention.max} (${aeoScore.breakdown.brand_mention.match_type})`);
      console.log(`  - Accuracy: ${aeoScore.breakdown.accuracy_context.score}/${aeoScore.breakdown.accuracy_context.max} (${aeoScore.breakdown.accuracy_context.quality})`);
      console.log(`  - Attribution: ${aeoScore.breakdown.attribution.score}/${aeoScore.breakdown.attribution.max}`);
      console.log(`  - Comparative: ${aeoScore.breakdown.comparative_position.score}/${aeoScore.breakdown.comparative_position.max} (${aeoScore.breakdown.comparative_position.position})`);
      if (aeoScore.penalties.misattribution_risk.risk_detected) {
        console.log(`  - ⚠️ Penalty: ${aeoScore.penalties.misattribution_risk.penalty} (misattribution detected)`);
      }

      // Attach AEO score to selection signals
      selectionSignals.aeo_score = aeoScore;

      // 9.1 ENHANCED SENTIMENT ANALYSIS
      let sentimentAnalysis = null;
      let netSentimentScore: number | null = null;
      
      if (visibilityCheck.isVisible) {
        console.log(`📊 Running enhanced sentiment analysis...`);
        try {
          sentimentAnalysis = await analyzeSentiment(
            simulationResult.answer_html,
            brand.name,
            brand.domain
          );
          netSentimentScore = sentimentAnalysis.net_sentiment_score;
          selectionSignals.sentiment_analysis = sentimentAnalysis;
          
          console.log(`Sentiment: ${sentimentAnalysis.label} (NSS: ${netSentimentScore})`);
          if (sentimentAnalysis.concerns?.length) {
            console.log(`  ⚠️ Concerns: ${sentimentAnalysis.concerns.slice(0, 2).join(", ")}`);
          }
        } catch (sentimentError) {
          console.warn("Sentiment analysis failed:", sentimentError);
        }
      }

      // 9.2 CITATION AUTHORITY MAPPING
      let citationAuthorities: CitationAuthority[] = [];
      
      if (simulationResult.standardized?.sources) {
        citationAuthorities = simulationResult.standardized.sources.map(source => ({
          domain: source.domain,
          authority_score: source.authority_score || 50,
          tier: source.authority_tier || 'medium',
          source_type: source.source_type || 'editorial',
          is_brand_domain: source.is_brand_match,
        }));
        selectionSignals.citation_authorities = citationAuthorities;
        
        const brandCitations = citationAuthorities.filter(c => c.is_brand_domain).length;
        console.log(`📚 Citation Authority: ${citationAuthorities.length} sources, ${brandCitations} brand citations`);
      }

      // 9.3 GROUNDING METADATA
      if (simulationResult.search_context?.grounding_metadata) {
        selectionSignals.grounding_metadata = simulationResult.search_context.grounding_metadata;
        const gm = simulationResult.search_context.grounding_metadata;
        if (gm.web_search_queries?.length) {
          console.log(`🔍 Gemini ran ${gm.web_search_queries.length} search queries: ${gm.web_search_queries.slice(0, 2).join(", ")}`);
        }
        if (gm.x_posts?.length) {
          console.log(`🐦 Grok used ${gm.x_posts.length} X posts`);
        }
      }

      // 9.5 HALLUCINATION WATCHDOG (Pro+ Feature) - Only run when enabled
      let hallucinationResult: HallucinationResult | undefined;
      
      if (enable_hallucination_watchdog && structuredGroundTruth) {
        console.log(`🐕 Hallucination Watchdog ENABLED - Running detection with structured ground truth...`);
        
        // Full AI-powered hallucination detection
        hallucinationResult = await detectHallucinations(
          simulationResult.answer_html,
          structuredGroundTruth,
          brand.name,
          brand.domain
        );
        
        // Also check for negative hallucination (AI refuses to answer but data exists)
        const negativeHallucination = detectNegativeHallucination(
          simulationResult.answer_html,
          structuredGroundTruth
        );
        
        if (negativeHallucination) {
          hallucinationResult.hallucinations.push(negativeHallucination);
          hallucinationResult.has_hallucinations = true;
        }
        
        if (hallucinationResult.has_hallucinations) {
          console.log(`⚠️ HALLUCINATIONS DETECTED: ${hallucinationResult.hallucinations.length} issues found`);
          hallucinationResult.hallucinations.forEach((h, i) => {
            console.log(`  ${i + 1}. [${h.type.toUpperCase()}] ${h.claim.slice(0, 100)}...`);
          });
        } else {
          console.log(`✓ No hallucinations detected (accuracy: ${hallucinationResult.accuracy_score}%)`);
        }
        
        // Attach hallucination results to selection signals (kept separate from other metrics)
        (selectionSignals as unknown as Record<string, unknown>).hallucination_watchdog = {
          enabled: true,
          result: hallucinationResult,
        };
        
        // If hallucinations were found, generate Schema fixes and add enhanced recommendations
        if (hallucinationResult.has_hallucinations) {
          const brandSettings = brand.settings as Record<string, unknown> || {};
          
          const enhancedActionItems = hallucinationResult.hallucinations.map((h: DetectedHallucination) => {
            // Generate Schema fix for this hallucination
            const schemaFix = generateSchemaFix(h, {
              name: brand.name,
              domain: brand.domain,
              description: brandSettings.product_description as string,
              industry: brandSettings.industry as string,
              services: structuredGroundTruth?.services,
              products: structuredGroundTruth?.products,
              pricing: structuredGroundTruth?.pricing,
            }, structuredGroundTruth);
            
            // Attach schema fix to the hallucination recommendation
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
          
          // Prepend hallucination fixes to action items
          selectionSignals.action_items = [
            ...enhancedActionItems,
            ...(selectionSignals.action_items || []),
          ];
        }
      } else if (!enable_hallucination_watchdog) {
        // Mark that watchdog was not enabled for this simulation
        (selectionSignals as unknown as Record<string, unknown>).hallucination_watchdog = {
          enabled: false,
          result: null,
        };
      }

      // 10. ENHANCE WITH TIERED, ENGINE-SPECIFIC RECOMMENDATIONS
      console.log(`📋 Generating ${engine}-specific recommendations...`);
      
      // Extract crawl analysis from ground truth summary (from Firecrawl)
      const groundTruthSummary = brand.ground_truth_summary as {
        crawl_analysis?: CrawlAnalysis;
      } | null;
      
      const crawlAnalysis = groundTruthSummary?.crawl_analysis;
      
      if (crawlAnalysis) {
        console.log(`📊 Using crawl analysis (${crawlAnalysis.summary.total_pages_analyzed} pages):`);
        console.log(`  🔴 Critical: ${crawlAnalysis.summary.critical_issues.length}`);
        console.log(`  🟠 High: ${crawlAnalysis.summary.high_priority_issues.length}`);
        console.log(`  🟡 Medium: ${crawlAnalysis.summary.medium_priority_issues.length}`);
      } else {
        console.log(`⚠️ No crawl analysis available - only generic suggestions will be generated`);
      }

      // Enhance selection signals with tiered recommendations
      const enhancedSignals = enhanceWithTieredRecommendations({
        selectionSignals,
        brandName: brand.name,
        brandDomain: brand.domain,
        query: promptText,
        engine: engine as SupportedEngine,
        crawlAnalysis,
      });

      // Extract quick wins for easy access
      const quickWins = enhancedSignals.tiered_recommendations 
        ? extractQuickWins(enhancedSignals.tiered_recommendations)
        : [];
      
      if (quickWins.length > 0) {
        enhancedSignals.quick_wins = quickWins;
      }

      console.log(`✓ Generated ${enhancedSignals.tiered_recommendations?.length || 0} tiered recommendations`);
      if (enhancedSignals.tiered_recommendations) {
        const tierCounts = {
          foundational: enhancedSignals.tiered_recommendations.filter(r => r.tier === 'foundational').length,
          high: enhancedSignals.tiered_recommendations.filter(r => r.tier === 'high').length,
          medium: enhancedSignals.tiered_recommendations.filter(r => r.tier === 'medium').length,
          'nice-to-have': enhancedSignals.tiered_recommendations.filter(r => r.tier === 'nice-to-have').length,
        };
        console.log(`  Tiers: Foundational=${tierCounts.foundational}, High=${tierCounts.high}, Medium=${tierCounts.medium}, Nice-to-have=${tierCounts['nice-to-have']}`);
        
        // Log platform-specific recommendations
        const platformRecs = enhancedSignals.tiered_recommendations.filter(r => r.platform_specific === engine);
        if (platformRecs.length > 0) {
          console.log(`  Platform-specific (${engine}): ${platformRecs.length} recommendations`);
        }
      }

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
        // Single mode: use OR logic
        isVisible = visibilityCheck.isVisible || enhancedSignals.is_visible;
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
          },
          status: "completed",
          error_message: null,
          // NEW: Enhanced fields
          standardized_result: (simulationResult as { standardized?: unknown }).standardized || null,
          sentiment_analysis: sentimentAnalysis || null,
          net_sentiment_score: netSentimentScore,
          grounding_metadata: simulationResult.search_context?.grounding_metadata || null,
          citation_authorities: citationAuthorities.length > 0 ? citationAuthorities : null,
        })
        .eq("id", simulationId);

      if (updateError) {
        console.error("Failed to update simulation:", updateError);
      }

      // 12. Update prompt last_checked_at
      await supabase
        .from("prompts")
        .update({ last_checked_at: new Date().toISOString() })
        .eq("id", prompt_id);

      // 13. Deduct credit (only if we have credits)
      if (organization.credits_balance > 0) {
        await supabase.rpc("deduct_credit", { org_id: organization.id });
      }

      console.log(`✓ Simulation completed: ${engine} for "${promptText}"`);
      console.log(`  Visibility: ${isVisible} (${presenceLevel}, ${Math.round(visibilityFrequency * 100)}% confidence)`);
      console.log(`  Statement: ${visibilityStatement}`);
      console.log(`  Recommendation: ${enhancedSignals.recommendation?.slice(0, 100)}...`);

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
      console.error(`✗ Simulation failed: ${engine} for "${promptText}" - ${errorMsg}`);
      
      // Update simulation as failed
      await supabase
        .from("simulations")
        .update({
          status: "failed",
          error_message: errorMsg,
        })
        .eq("id", simulationId);

      throw error;
    }
  },
});
