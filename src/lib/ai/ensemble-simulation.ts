/**
 * Ensemble Simulation Module
 * 
 * CORE INSIGHT: A single simulated response cannot be treated as ground truth.
 * Variance in AI responses means a missed brand in one run may appear in another.
 * 
 * SOLUTION: Run multiple independent simulations and aggregate:
 * - Union of all brands seen (high recall)
 * - Frequency per brand (how often it appears)
 * - Confidence score for "brand appears in live-like output"
 * 
 * Brand presence classification:
 * - Definite present: brand appears in ≥60% of runs
 * - Possible present: appears in 20-59%
 * - Inconclusive: appears in 1-19%
 * - Likely absent: appears in 0% and search context doesn't support it
 */

import { runSimulation } from "@/lib/ai/factory";
import { 
  extractBrands, 
  checkBrandVisibility,
  type BrandExtractionResult,
  type ExtractedBrand,
} from "@/lib/ai/brand-extractor";
import { 
  ENSEMBLE_RUN_COUNT, 
  BRAND_CONFIDENCE_THRESHOLDS,
} from "@/lib/ai/openai-config";
import type {
  SupportedEngine,
  SupportedLanguage,
  SupportedRegion,
  SimulationRawResult,
  SourceReference,
} from "@/types";

// ===========================================
// Types
// ===========================================

export type BrandPresenceLevel = 
  | "definite_present"   // ≥60% of runs
  | "possible_present"   // 20-59% of runs
  | "inconclusive"       // 1-19% of runs
  | "likely_absent";     // 0% of runs

export interface EnsembleBrandResult {
  name: string;
  normalized_name: string;
  domain?: string;
  frequency: number;           // 0-1, how often brand appeared across runs
  appearance_count: number;    // Number of runs where brand appeared
  total_runs: number;
  presence_level: BrandPresenceLevel;
  
  // Detailed evidence
  mention_frequency: number;   // How often mentioned in answer text
  source_frequency: number;    // How often found in sources
  evidence_summary: string;
  
  // Per-run details
  run_details: Array<{
    run_index: number;
    is_mentioned: boolean;
    is_supported: boolean;
    mention_count: number;
    source_count: number;
  }>;
}

export interface TargetBrandResult {
  name: string;
  domain: string;
  
  // Aggregate metrics
  visibility_frequency: number;    // 0-1, how often visible across runs
  presence_level: BrandPresenceLevel;
  confidence: "high" | "medium" | "low";
  
  // Detailed breakdown
  mentioned_in_runs: number;       // Runs where brand was in answer text
  supported_in_runs: number;       // Runs where brand was in sources
  total_runs: number;
  
  // Evidence for each run
  run_results: Array<{
    run_index: number;
    is_visible: boolean;
    visibility_type: "mentioned" | "supported" | "absent";
    mention_count: number;
    source_count: number;
    evidence: string[];
  }>;
  
  // Actionable summary
  summary: string;
}

export interface EnsembleSimulationResult {
  // Metadata
  engine: SupportedEngine;
  keyword: string;
  region: SupportedRegion;
  total_runs: number;
  successful_runs: number;
  
  // Target brand analysis (if specified)
  target_brand_result?: TargetBrandResult;
  
  // All brands detected across all runs
  all_brands: EnsembleBrandResult[];
  
  // Union of all sources across runs
  all_sources: SourceReference[];
  unique_domains: string[];
  
  // Best answer (from most representative run)
  representative_answer: string;
  representative_run_index: number;
  
  // Individual run results (for debugging/analysis)
  run_results: Array<{
    index: number;
    success: boolean;
    answer_text?: string;
    sources?: SourceReference[];
    brands_extracted?: BrandExtractionResult;
    error?: string;
  }>;
  
  // Analysis notes
  notes: string[];
}

// ===========================================
// Ensemble Runner
// ===========================================

export interface RunEnsembleInput {
  engine: SupportedEngine;
  keyword: string;
  language: SupportedLanguage;
  region?: SupportedRegion;
  brand_domain: string;
  
  // Target brand to track (optional but recommended)
  target_brand?: {
    name: string;
    domain: string;
    aliases: string[];
  };
  
  // Override default run count
  run_count?: number;
}

/**
 * Run ensemble simulation with multiple independent runs
 * 
 * This is the core function for high-recall brand detection.
 * Aggregates results across multiple runs to reduce variance.
 */
export async function runEnsembleSimulation(
  input: RunEnsembleInput
): Promise<EnsembleSimulationResult> {
  const { 
    engine, 
    keyword, 
    language, 
    region = "global", 
    brand_domain,
    target_brand,
    run_count = ENSEMBLE_RUN_COUNT,
  } = input;
  
  console.log(`[Ensemble] Starting ${run_count} runs for "${keyword}" on ${engine} (region: ${region})`);
  
  const runResults: EnsembleSimulationResult["run_results"] = [];
  const allBrandExtractions: BrandExtractionResult[] = [];
  const allSources: SourceReference[] = [];
  const seenUrls = new Set<string>();
  
  // Run simulations sequentially to avoid rate limits
  // (Could be parallelized with careful rate limiting)
  for (let i = 0; i < run_count; i++) {
    console.log(`[Ensemble] Run ${i + 1}/${run_count}...`);
    
    try {
      // 1. Run simulation
      const simResult = await runSimulation({
        engine,
        keyword,
        language,
        brand_domain,
        region,
      });
      
      // 2. Collect sources (deduplicated)
      for (const source of simResult.sources) {
        if (!seenUrls.has(source.url)) {
          seenUrls.add(source.url);
          allSources.push(source);
        }
      }
      
      // 3. Extract brands from this run
      const brandExtraction = await extractBrands({
        answer_text: simResult.answer_html,
        sources: simResult.sources,
        search_results: simResult.search_context?.results,
        target_brand,
        engine,
      });
      
      allBrandExtractions.push(brandExtraction);
      
      runResults.push({
        index: i,
        success: true,
        answer_text: simResult.answer_html,
        sources: simResult.sources,
        brands_extracted: brandExtraction,
      });
      
      console.log(`[Ensemble] Run ${i + 1} found ${brandExtraction.all_brands.length} brands`);
      
    } catch (error) {
      console.error(`[Ensemble] Run ${i + 1} failed:`, error);
      runResults.push({
        index: i,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    
    // Small delay between runs to reduce rate limit risk
    if (i < run_count - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  const successfulRuns = runResults.filter(r => r.success);
  const totalSuccessful = successfulRuns.length;
  
  if (totalSuccessful === 0) {
    throw new Error("All ensemble runs failed");
  }
  
  console.log(`[Ensemble] ${totalSuccessful}/${run_count} runs successful`);
  
  // 4. Aggregate brands across all runs
  const allBrands = aggregateBrandsAcrossRuns(allBrandExtractions, totalSuccessful);
  
  // 5. Analyze target brand (if specified)
  let targetBrandResult: TargetBrandResult | undefined;
  if (target_brand) {
    targetBrandResult = analyzeTargetBrand(
      target_brand,
      allBrandExtractions,
      runResults
    );
    console.log(`[Ensemble] Target brand "${target_brand.name}": ${targetBrandResult.presence_level} (${Math.round(targetBrandResult.visibility_frequency * 100)}%)`);
  }
  
  // 6. Find representative answer (most common structure)
  const representativeRunIndex = findRepresentativeRun(successfulRuns, allBrands, target_brand);
  const representativeAnswer = successfulRuns[representativeRunIndex]?.answer_text || "";
  
  // 7. Extract unique domains
  const uniqueDomains = Array.from(new Set(
    allSources.map(s => {
      try {
        return new URL(s.url).hostname.replace(/^www\./, '');
      } catch {
        return '';
      }
    }).filter(Boolean)
  ));
  
  // 8. Generate analysis notes
  const notes: string[] = [];
  
  if (totalSuccessful < run_count) {
    notes.push(`${run_count - totalSuccessful} runs failed - results based on ${totalSuccessful} runs`);
  }
  
  const brandVariance = calculateBrandVariance(allBrandExtractions);
  if (brandVariance > 0.3) {
    notes.push(`High variance in brand detection (${Math.round(brandVariance * 100)}%) - results may be less reliable`);
  }
  
  if (target_brand && targetBrandResult) {
    if (targetBrandResult.presence_level === "inconclusive") {
      notes.push(`Target brand visibility is inconclusive - appeared in only ${targetBrandResult.mentioned_in_runs + targetBrandResult.supported_in_runs}/${totalSuccessful} runs`);
    }
  }
  
  return {
    engine,
    keyword,
    region,
    total_runs: run_count,
    successful_runs: totalSuccessful,
    target_brand_result: targetBrandResult,
    all_brands: allBrands,
    all_sources: allSources,
    unique_domains: uniqueDomains,
    representative_answer: representativeAnswer,
    representative_run_index: representativeRunIndex,
    run_results: runResults,
    notes,
  };
}

// ===========================================
// Aggregation Functions
// ===========================================

/**
 * Aggregate brands across all runs with frequency analysis
 */
function aggregateBrandsAcrossRuns(
  extractions: BrandExtractionResult[],
  totalRuns: number
): EnsembleBrandResult[] {
  const brandMap = new Map<string, {
    name: string;
    domain?: string;
    appearances: number;
    mentionAppearances: number;
    sourceAppearances: number;
    totalMentions: number;
    totalSources: number;
    runDetails: EnsembleBrandResult["run_details"];
  }>();
  
  for (let i = 0; i < extractions.length; i++) {
    const extraction = extractions[i];
    
    for (const brand of extraction.all_brands) {
      const key = brand.normalized_name;
      
      if (!brandMap.has(key)) {
        brandMap.set(key, {
          name: brand.name,
          domain: brand.domain,
          appearances: 0,
          mentionAppearances: 0,
          sourceAppearances: 0,
          totalMentions: 0,
          totalSources: 0,
          runDetails: [],
        });
      }
      
      const entry = brandMap.get(key)!;
      entry.appearances++;
      if (brand.is_mentioned) entry.mentionAppearances++;
      if (brand.is_supported) entry.sourceAppearances++;
      entry.totalMentions += brand.mention_count;
      entry.totalSources += brand.source_count;
      
      entry.runDetails.push({
        run_index: i,
        is_mentioned: brand.is_mentioned,
        is_supported: brand.is_supported,
        mention_count: brand.mention_count,
        source_count: brand.source_count,
      });
    }
  }
  
  // Convert to array and calculate frequencies
  const results: EnsembleBrandResult[] = [];
  
  for (const [normalizedName, entry] of brandMap) {
    const frequency = entry.appearances / totalRuns;
    const presenceLevel = getPresenceLevel(frequency);
    
    results.push({
      name: entry.name,
      normalized_name: normalizedName,
      domain: entry.domain,
      frequency,
      appearance_count: entry.appearances,
      total_runs: totalRuns,
      presence_level: presenceLevel,
      mention_frequency: entry.mentionAppearances / totalRuns,
      source_frequency: entry.sourceAppearances / totalRuns,
      evidence_summary: `Appeared in ${entry.appearances}/${totalRuns} runs (${entry.totalMentions} mentions, ${entry.totalSources} sources)`,
      run_details: entry.runDetails,
    });
  }
  
  // Sort by frequency (highest first)
  return results.sort((a, b) => b.frequency - a.frequency);
}

/**
 * Analyze target brand visibility across runs
 */
function analyzeTargetBrand(
  target: { name: string; domain: string; aliases: string[] },
  extractions: BrandExtractionResult[],
  runResults: EnsembleSimulationResult["run_results"]
): TargetBrandResult {
  const runResultsArr: TargetBrandResult["run_results"] = [];
  let mentionedInRuns = 0;
  let supportedInRuns = 0;
  let visibleInRuns = 0;
  
  for (let i = 0; i < extractions.length; i++) {
    const extraction = extractions[i];
    const visibility = checkBrandVisibility(extraction, target);
    
    if (visibility.is_visible) {
      visibleInRuns++;
      if (visibility.visibility_type === "mentioned") {
        mentionedInRuns++;
      } else if (visibility.visibility_type === "supported") {
        supportedInRuns++;
      }
    }
    
    runResultsArr.push({
      run_index: i,
      is_visible: visibility.is_visible,
      visibility_type: visibility.visibility_type,
      mention_count: visibility.mention_count,
      source_count: visibility.source_count,
      evidence: visibility.evidence,
    });
  }
  
  const totalRuns = extractions.length;
  const visibilityFrequency = visibleInRuns / totalRuns;
  const presenceLevel = getPresenceLevel(visibilityFrequency);
  
  // Determine confidence based on consistency
  let confidence: "high" | "medium" | "low";
  if (visibilityFrequency >= 0.8 || visibilityFrequency <= 0.2) {
    confidence = "high"; // Clear result
  } else if (visibilityFrequency >= 0.5) {
    confidence = "medium";
  } else {
    confidence = "low";
  }
  
  // Generate summary
  let summary: string;
  switch (presenceLevel) {
    case "definite_present":
      summary = `${target.name} is definitively visible (appeared in ${Math.round(visibilityFrequency * 100)}% of simulations)`;
      break;
    case "possible_present":
      summary = `${target.name} may be visible (appeared in ${Math.round(visibilityFrequency * 100)}% of simulations) - results vary`;
      break;
    case "inconclusive":
      summary = `${target.name} visibility is inconclusive (appeared in only ${Math.round(visibilityFrequency * 100)}% of simulations)`;
      break;
    case "likely_absent":
      summary = `${target.name} is likely not visible (not found in any simulation)`;
      break;
  }
  
  return {
    name: target.name,
    domain: target.domain,
    visibility_frequency: visibilityFrequency,
    presence_level: presenceLevel,
    confidence,
    mentioned_in_runs: mentionedInRuns,
    supported_in_runs: supportedInRuns,
    total_runs: totalRuns,
    run_results: runResultsArr,
    summary,
  };
}

/**
 * Get presence level from frequency
 */
function getPresenceLevel(frequency: number): BrandPresenceLevel {
  if (frequency >= BRAND_CONFIDENCE_THRESHOLDS.definite_present) {
    return "definite_present";
  }
  if (frequency >= BRAND_CONFIDENCE_THRESHOLDS.possible_present) {
    return "possible_present";
  }
  if (frequency >= BRAND_CONFIDENCE_THRESHOLDS.inconclusive) {
    return "inconclusive";
  }
  return "likely_absent";
}

/**
 * Calculate variance in brand detection across runs
 */
function calculateBrandVariance(extractions: BrandExtractionResult[]): number {
  if (extractions.length < 2) return 0;
  
  // Count brands in each run
  const counts = extractions.map(e => e.all_brands.length);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);
  
  // Normalize to 0-1 range (coefficient of variation)
  return mean > 0 ? stdDev / mean : 0;
}

/**
 * Find the most representative run (closest to median brand count with target brand present if applicable)
 */
function findRepresentativeRun(
  successfulRuns: EnsembleSimulationResult["run_results"],
  allBrands: EnsembleBrandResult[],
  target_brand?: { name: string; domain: string; aliases: string[] }
): number {
  if (successfulRuns.length === 0) return 0;
  if (successfulRuns.length === 1) return 0;
  
  // Calculate median brand count
  const brandCounts = successfulRuns
    .filter(r => r.brands_extracted)
    .map(r => r.brands_extracted!.all_brands.length)
    .sort((a, b) => a - b);
  
  const medianCount = brandCounts[Math.floor(brandCounts.length / 2)];
  
  // Find run closest to median that has target brand (if specified and present in majority)
  let bestIndex = 0;
  let bestScore = Infinity;
  
  for (let i = 0; i < successfulRuns.length; i++) {
    const run = successfulRuns[i];
    if (!run.brands_extracted) continue;
    
    const countDiff = Math.abs(run.brands_extracted.all_brands.length - medianCount);
    let score = countDiff;
    
    // Penalize runs without target brand if it's usually present
    if (target_brand) {
      const visibility = checkBrandVisibility(run.brands_extracted, target_brand);
      const targetFrequency = allBrands.find(b => 
        b.normalized_name === target_brand.name.toLowerCase().trim()
      )?.frequency || 0;
      
      if (!visibility.is_visible && targetFrequency >= 0.5) {
        score += 10; // Heavy penalty for missing commonly-present target
      }
    }
    
    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  
  return bestIndex;
}

// ===========================================
// Simplified Single-Run Mode (for backwards compatibility)
// ===========================================

/**
 * Run a single simulation with brand extraction
 * Use this for quick checks or when ensemble is too expensive
 */
export async function runSingleSimulationWithExtraction(
  input: Omit<RunEnsembleInput, "run_count">
): Promise<{
  simulation: SimulationRawResult;
  brand_extraction: BrandExtractionResult;
  target_visibility?: {
    is_visible: boolean;
    confidence: "high" | "medium" | "low";
    evidence: string[];
  };
}> {
  const { engine, keyword, language, region = "global", brand_domain, target_brand } = input;
  
  // Run simulation
  const simulation = await runSimulation({
    engine,
    keyword,
    language,
    brand_domain,
    region,
  });
  
  // Extract brands
  const brand_extraction = await extractBrands({
    answer_text: simulation.answer_html,
    sources: simulation.sources,
    search_results: simulation.search_context?.results,
    target_brand,
    engine,
  });
  
  // Check target brand visibility
  let target_visibility;
  if (target_brand) {
    const visibility = checkBrandVisibility(brand_extraction, target_brand);
    target_visibility = {
      is_visible: visibility.is_visible,
      confidence: visibility.confidence,
      evidence: visibility.evidence,
    };
  }
  
  return {
    simulation,
    brand_extraction,
    target_visibility,
  };
}

