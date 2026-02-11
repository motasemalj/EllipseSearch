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
 * - Statistical significance testing
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
} from "@/lib/ai/brand-extractor";
import { 
  ENSEMBLE_RUN_COUNT, 
  BRAND_CONFIDENCE_THRESHOLDS,
  DEFAULT_BROWSER_SIMULATION_MODE,
  MIN_ENSEMBLE_RUNS,
  MAX_ENSEMBLE_RUNS,
  type BrowserSimulationMode,
} from "@/lib/ai/openai-config";
import type {
  SupportedEngine,
  SupportedLanguage,
  SupportedRegion,
  SimulationRawResult,
  SourceReference,
  ConfidenceInterval,
  EnsembleVarianceMetrics,
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
  
  // Statistical confidence
  confidence_interval?: ConfidenceInterval;
  
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
  
  // Statistical confidence
  confidence_interval?: ConfidenceInterval;
  statistical_significance: boolean;
  p_value?: number;
  
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
  
  // Variance metrics (when enabled)
  variance_metrics?: EnsembleVarianceMetrics;
  
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
// Statistical Functions
// ===========================================

/**
 * Calculate Wilson score confidence interval for a proportion.
 * More accurate than simple binomial for small sample sizes.
 */
function calculateWilsonConfidenceInterval(
  successCount: number,
  totalTrials: number,
  confidenceLevel: number = 0.95
): ConfidenceInterval {
  // Z-scores for common confidence levels
  const zScores: Record<number, number> = {
    0.90: 1.645,
    0.95: 1.96,
    0.99: 2.576,
  };
  const z = zScores[confidenceLevel] || 1.96;
  
  const n = totalTrials;
  const p = successCount / n;
  
  if (n === 0) {
    return {
      frequency: 0,
      lower_bound: 0,
      upper_bound: 0,
      confidence_level: confidenceLevel,
      sample_size: 0,
    };
  }
  
  // Wilson score interval formula
  const denominator = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denominator;
  const margin = (z / denominator) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  
  return {
    frequency: p,
    lower_bound: Math.max(0, center - margin),
    upper_bound: Math.min(1, center + margin),
    confidence_level: confidenceLevel,
    sample_size: n,
  };
}

/**
 * Calculate p-value for the null hypothesis that brand is absent.
 * Uses binomial test.
 */
function calculatePValue(
  successCount: number,
  totalTrials: number,
  nullProbability: number = 0.05 // Assume 5% baseline presence by chance
): number {
  // Binomial cumulative probability
  // P(X >= successCount) under null hypothesis
  let pValue = 0;
  
  for (let k = successCount; k <= totalTrials; k++) {
    const combination = binomialCoefficient(totalTrials, k);
    pValue += combination * Math.pow(nullProbability, k) * Math.pow(1 - nullProbability, totalTrials - k);
  }
  
  return Math.min(1, pValue);
}

/**
 * Calculate binomial coefficient (n choose k)
 */
function binomialCoefficient(n: number, k: number): number {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;
  
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = result * (n - i + 1) / i;
  }
  return result;
}

/**
 * Determine if a result is statistically significant.
 */
function isStatisticallySignificant(
  pValue: number,
  significanceLevel: number = 0.05
): boolean {
  return pValue < significanceLevel;
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
  
  // Override default run count (1-15)
  run_count?: number;
  
  // Simulation mode: api (default), browser (Playwright), or hybrid
  simulation_mode?: BrowserSimulationMode;
  
  // Enable detailed variance metrics
  enable_variance_metrics?: boolean;
}

/**
 * Validate and normalize run count to allowed range.
 */
function normalizeRunCount(runCount?: number): number {
  const count = runCount ?? ENSEMBLE_RUN_COUNT;
  return Math.max(MIN_ENSEMBLE_RUNS, Math.min(MAX_ENSEMBLE_RUNS, count));
}

/**
 * Run a single simulation using API mode
 * 
 * NOTE: Browser/BrowserPool mode is DEPRECATED. 
 * For real browser automation, use RPA mode which runs via the external Python worker.
 */
async function runSimulationWithMode(
  input: {
    engine: SupportedEngine;
    keyword: string;
    language: SupportedLanguage;
    region: SupportedRegion;
    brand_domain: string;
    simulation_mode: BrowserSimulationMode;
  }
): Promise<SimulationRawResult> {
  const { engine, keyword, language, region, brand_domain, simulation_mode } = input;
  
  // RPA mode should never reach here - it's handled separately
  if (simulation_mode === 'rpa') {
    throw new Error('[Ensemble] RPA mode should not reach runSimulationWithMode - check analysis flow');
  }
  
  // Browser/hybrid modes are DEPRECATED - log warning and use API
  if (simulation_mode === 'browser' || simulation_mode === 'hybrid') {
    console.warn(`[Ensemble] ⚠️ ${simulation_mode} mode is deprecated. Use RPA for real browser automation.`);
    console.warn(`[Ensemble] Falling back to API mode.`);
  }
  
  // Always use API mode (browser/BrowserPool is deprecated)
  return runSimulation({
    engine,
    keyword,
    language,
    brand_domain,
    region,
  });
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
    run_count: requestedRunCount,
    simulation_mode = DEFAULT_BROWSER_SIMULATION_MODE,
    enable_variance_metrics = false,
  } = input;
  
  // Validate and normalize run count
  const run_count = normalizeRunCount(requestedRunCount);
  
  // Force API mode - browser/BrowserPool is deprecated, RPA is handled separately
  const effectiveMode = (simulation_mode === 'browser' || simulation_mode === 'hybrid') 
    ? 'api' 
    : simulation_mode;
  
  const modeLabel = effectiveMode === 'api' ? 'API' : effectiveMode === 'rpa' ? 'RPA' : effectiveMode;
  console.log(`[Ensemble] Starting ${run_count} runs for "${keyword}" on ${engine} (region: ${region}, mode: ${modeLabel})`);
  
  const runResults: EnsembleSimulationResult["run_results"] = [];
  const allBrandExtractions: BrandExtractionResult[] = [];
  const allSources: SourceReference[] = [];
  const seenUrls = new Set<string>();
  
  // Run simulations sequentially to avoid rate limits
  for (let i = 0; i < run_count; i++) {
    console.log(`[Ensemble] Run ${i + 1}/${run_count} (${modeLabel})...`);
    
    try {
      // 1. Run simulation using API mode
      const simResult = await runSimulationWithMode({
        engine,
        keyword,
        language,
        brand_domain,
        region,
        simulation_mode: effectiveMode,
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
  const allBrands = aggregateBrandsAcrossRuns(allBrandExtractions, totalSuccessful, enable_variance_metrics);
  
  // 5. Analyze target brand (if specified)
  let targetBrandResult: TargetBrandResult | undefined;
  if (target_brand) {
    targetBrandResult = analyzeTargetBrand(
      target_brand,
      allBrandExtractions,
      runResults,
      enable_variance_metrics
    );
    console.log(`[Ensemble] Target brand "${target_brand.name}": ${targetBrandResult.presence_level} (${Math.round(targetBrandResult.visibility_frequency * 100)}%)${targetBrandResult.statistical_significance ? ' [statistically significant]' : ''}`);
  }
  
  // 6. Find representative answer
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
    if (!targetBrandResult.statistical_significance) {
      notes.push(`Result is not statistically significant - consider running more simulations`);
    }
  }
  
  // 9. Build variance metrics if enabled
  let varianceMetrics: EnsembleVarianceMetrics | undefined;
  if (enable_variance_metrics) {
    const targetFrequency = targetBrandResult?.visibility_frequency ?? 0;
    const visibleRuns = targetBrandResult 
      ? targetBrandResult.mentioned_in_runs + targetBrandResult.supported_in_runs
      : 0;
    
    varianceMetrics = {
      run_count,
      successful_runs: totalSuccessful,
      brand_variance: brandVariance,
      confidence_interval: calculateWilsonConfidenceInterval(visibleRuns, totalSuccessful),
      statistical_significance: targetBrandResult?.statistical_significance ?? false,
      p_value: targetBrandResult?.p_value,
      standard_error: totalSuccessful > 0 
        ? Math.sqrt((targetFrequency * (1 - targetFrequency)) / totalSuccessful)
        : undefined,
    };
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
    variance_metrics: varianceMetrics,
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
  totalRuns: number,
  includeConfidenceIntervals: boolean = false
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
  
  for (const [normalizedName, entry] of Array.from(brandMap.entries())) {
    const frequency = entry.appearances / totalRuns;
    const presenceLevel = getPresenceLevel(frequency);
    
    const result: EnsembleBrandResult = {
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
    };
    
    if (includeConfidenceIntervals) {
      result.confidence_interval = calculateWilsonConfidenceInterval(entry.appearances, totalRuns);
    }
    
    results.push(result);
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _runResults: EnsembleSimulationResult["run_results"],
  includeStatistics: boolean = false
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
  
  // Calculate statistical significance
  const pValue = includeStatistics 
    ? calculatePValue(visibleInRuns, totalRuns)
    : undefined;
  const statisticalSignificance = pValue !== undefined 
    ? isStatisticallySignificant(pValue)
    : visibilityFrequency >= 0.6 || visibilityFrequency === 0;
  
  // Calculate confidence interval
  const confidenceInterval = includeStatistics
    ? calculateWilsonConfidenceInterval(visibleInRuns, totalRuns)
    : undefined;
  
  // Determine confidence based on consistency and sample size
  let confidence: "high" | "medium" | "low";
  if (totalRuns >= 5 && (visibilityFrequency >= 0.8 || visibilityFrequency <= 0.2)) {
    confidence = "high";
  } else if (totalRuns >= 3 && visibilityFrequency >= 0.5) {
    confidence = "medium";
  } else {
    confidence = "low";
  }
  
  // Generate summary with statistical context
  let summary: string;
  const ciSuffix = confidenceInterval 
    ? ` (95% CI: ${Math.round(confidenceInterval.lower_bound * 100)}-${Math.round(confidenceInterval.upper_bound * 100)}%)`
    : '';
  
  switch (presenceLevel) {
    case "definite_present":
      summary = `${target.name} is definitively visible (appeared in ${Math.round(visibilityFrequency * 100)}% of simulations)${ciSuffix}`;
      break;
    case "possible_present":
      summary = `${target.name} may be visible (appeared in ${Math.round(visibilityFrequency * 100)}% of simulations)${ciSuffix} - results vary`;
      break;
    case "inconclusive":
      summary = `${target.name} visibility is inconclusive (appeared in only ${Math.round(visibilityFrequency * 100)}% of simulations)${ciSuffix}`;
      break;
    case "likely_absent":
      summary = `${target.name} is likely not visible (not found in any simulation)`;
      break;
  }
  
  if (!statisticalSignificance && totalRuns < 5) {
    summary += ` Consider running more simulations for statistical significance.`;
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
    confidence_interval: confidenceInterval,
    statistical_significance: statisticalSignificance,
    p_value: pValue,
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
 * Find the most representative run
 */
function findRepresentativeRun(
  successfulRuns: EnsembleSimulationResult["run_results"],
  allBrands: EnsembleBrandResult[],
  target_brand?: { name: string; domain: string; aliases: string[] }
): number {
  if (successfulRuns.length === 0) return 0;
  if (successfulRuns.length === 1) return 0;
  
  const brandCounts = successfulRuns
    .filter(r => r.brands_extracted)
    .map(r => r.brands_extracted!.all_brands.length)
    .sort((a, b) => a - b);
  
  const medianCount = brandCounts[Math.floor(brandCounts.length / 2)];
  
  let bestIndex = 0;
  let bestScore = Infinity;
  
  for (let i = 0; i < successfulRuns.length; i++) {
    const run = successfulRuns[i];
    if (!run.brands_extracted) continue;
    
    const countDiff = Math.abs(run.brands_extracted.all_brands.length - medianCount);
    let score = countDiff;
    
    if (target_brand) {
      const visibility = checkBrandVisibility(run.brands_extracted, target_brand);
      const targetFrequency = allBrands.find(b => 
        b.normalized_name === target_brand.name.toLowerCase().trim()
      )?.frequency || 0;
      
      if (!visibility.is_visible && targetFrequency >= 0.5) {
        score += 10;
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
// Simplified Single-Run Mode
// ===========================================

/**
 * Run a single simulation with brand extraction
 */
export async function runSingleSimulationWithExtraction(
  input: Omit<RunEnsembleInput, "run_count" | "enable_variance_metrics">
): Promise<{
  simulation: SimulationRawResult;
  target_visibility?: {
    is_visible: boolean;
    confidence: "high" | "medium" | "low";
    evidence: string[];
  };
}> {
  const { 
    engine, 
    keyword, 
    language, 
    region = "global", 
    brand_domain, 
    target_brand,
    simulation_mode = 'api',
  } = input;
  
  const effectiveMode = (simulation_mode === 'browser' || simulation_mode === 'hybrid') 
    ? 'api' 
    : simulation_mode;
  
  const simulation = await runSimulationWithMode({
    engine,
    keyword,
    language,
    brand_domain,
    region,
    simulation_mode: effectiveMode,
  });
  
  let target_visibility;
  if (target_brand) {
    const answer = (simulation.answer_html || "").toLowerCase();
    const domain = (target_brand.domain || "").toLowerCase().replace(/^www\./, "");
    const domainCore = domain.split(".")[0];
    const names = [
      target_brand.name,
      domain,
      domainCore,
      ...(target_brand.aliases || []),
    ]
      .map((s) => (s || "").toLowerCase().trim())
      .filter((s) => s.length >= 3);

    const mentioned = names.some((n) => answer.includes(n));
    const supported = (simulation.sources || []).some((s) => (s.url || "").toLowerCase().includes(domainCore));

    const evidence: string[] = [];
    if (mentioned) evidence.push("Mentioned in answer text");
    if (supported) evidence.push("Supported by cited sources");
    const confidence: "high" | "medium" | "low" = mentioned ? "high" : supported ? "medium" : "low";

    target_visibility = {
      is_visible: mentioned || supported,
      confidence,
      evidence: evidence.length ? evidence : ["Not mentioned and not supported by sources"],
    };
  }
  
  return {
    simulation,
    target_visibility,
  };
}
