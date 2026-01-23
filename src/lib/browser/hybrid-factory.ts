/**
 * Hybrid Simulation Factory
 * 
 * Unified entry point for running AI simulations with choice of:
 * - API mode: Fast, stable, uses official APIs (current implementation)
 * - Browser mode: Real-world parity, captures DOM elements APIs don't expose
 * 
 * STRATEGY:
 * - Use Browser mode for accurate "what humans see" measurements
 * - Use API mode for high-volume, cost-effective analysis
 * - Combine both for highest fidelity results
 */

import type {
  SupportedEngine,
  SupportedLanguage,
  SupportedRegion,
  SimulationRawResult,
  SourceReference,
  SearchContext,
} from '@/types';
import type { BrowserCaptureResult, BrowserOptions } from './types';
import { getBrowserEngine } from './engines';
import { runSimulation as runAPISimulation } from '@/lib/ai/factory';

// ===========================================
// Types
// ===========================================

export type BrowserSimulationMode = 'api' | 'browser' | 'hybrid';

export interface HybridSimulationInput {
  engine: SupportedEngine;
  prompt: string;
  language: SupportedLanguage;
  region: SupportedRegion;
  brand_domain: string;
  
  // Mode selection
  mode: BrowserSimulationMode;
  
  // Browser-specific options
  browser_options?: BrowserOptions;
  
  // Hybrid mode options
  hybrid_options?: {
    prefer_browser_citations: boolean;  // Use browser citations over API
    merge_sources: boolean;             // Combine sources from both
    use_api_for_text: boolean;          // Use API text, browser for citations
  };
}

export interface HybridSimulationResult extends SimulationRawResult {
  // Mode used
  mode: BrowserSimulationMode;
  
  // Browser-specific data (when browser mode used)
  browser_data?: {
    citations: BrowserCaptureResult['citations'];
    search_chips: BrowserCaptureResult['search_chips'];
    product_tiles: BrowserCaptureResult['product_tiles'];
    source_cards: BrowserCaptureResult['source_cards'];
    knowledge_panel: BrowserCaptureResult['knowledge_panel'];
    suggested_followups: BrowserCaptureResult['suggested_followups'];
    response_time_ms: number;
    was_logged_in: boolean;
  };
  
  // Timing
  total_time_ms: number;
  api_time_ms?: number;
  browser_time_ms?: number;
}

// ===========================================
// Main Factory Function
// ===========================================

/**
 * Run a simulation using the specified mode
 * 
 * @param input - Simulation configuration
 * @returns Unified result with mode-specific data
 */
export async function runBrowserSimulation(
  input: HybridSimulationInput
): Promise<HybridSimulationResult> {
  const startTime = Date.now();
  
  console.log(`[HybridFactory] Running ${input.mode} simulation for ${input.engine}: "${input.prompt.slice(0, 50)}..."`);
  
  switch (input.mode) {
    case 'api':
      return runAPIMode(input, startTime);
    
    case 'browser':
      return runBrowserMode(input, startTime);
    
    case 'hybrid':
      return runHybridMode(input, startTime);
    
    default:
      throw new Error(`Unknown simulation mode: ${input.mode}`);
  }
}

// ===========================================
// API Mode
// ===========================================

async function runAPIMode(
  input: HybridSimulationInput,
  startTime: number
): Promise<HybridSimulationResult> {
  const apiResult = await runAPISimulation({
    engine: input.engine,
    keyword: input.prompt,
    language: input.language,
    brand_domain: input.brand_domain,
    region: input.region,
  });
  
  const totalTime = Date.now() - startTime;
  
  return {
    ...apiResult,
    mode: 'api',
    total_time_ms: totalTime,
    api_time_ms: totalTime,
  };
}

// ===========================================
// Browser Mode
// ===========================================

async function runBrowserMode(
  input: HybridSimulationInput,
  startTime: number
): Promise<HybridSimulationResult> {
  const browserEngine = getBrowserEngine(input.engine);
  
  try {
    const browserResult = await browserEngine.runSimulation({
      prompt: input.prompt,
      language: input.language,
      region: input.region,
      brand_domain: input.brand_domain,
      options: input.browser_options,
    });
    
    const totalTime = Date.now() - startTime;
    
    // Convert browser result to standard format
    const sources = convertBrowserSourcesToStandard(browserResult);
    const searchContext = buildSearchContextFromBrowser(browserResult, input.prompt);
    
    return {
      answer_html: browserResult.answer_html,
      sources,
      search_context: searchContext,
      mode: 'browser',
      browser_data: {
        citations: browserResult.citations,
        search_chips: browserResult.search_chips,
        product_tiles: browserResult.product_tiles,
        source_cards: browserResult.source_cards,
        knowledge_panel: browserResult.knowledge_panel,
        suggested_followups: browserResult.suggested_followups,
        response_time_ms: browserResult.response_time_ms,
        was_logged_in: browserResult.was_logged_in,
      },
      total_time_ms: totalTime,
      browser_time_ms: totalTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // For ChatGPT specifically, provide helpful guidance and fallback to API
    if (input.engine === 'chatgpt') {
      console.warn(`[HybridFactory] ChatGPT browser mode failed: ${errorMessage}`);
      console.warn('[HybridFactory] ChatGPT has aggressive bot detection. Options:');
      console.warn('  1. Run: npx tsx scripts/verify-chatgpt.ts (manual verification)');
      console.warn('  2. Use API mode (simulation_mode: "api")');
      console.warn('[HybridFactory] Falling back to API mode...');
      
      // Automatic fallback to API for ChatGPT
      return runAPIMode(input, startTime);
    }
    
    // For other engines, re-throw
    throw error;
  }
}

// ===========================================
// Hybrid Mode
// ===========================================

async function runHybridMode(
  input: HybridSimulationInput,
  startTime: number
): Promise<HybridSimulationResult> {
  const options = input.hybrid_options || {
    prefer_browser_citations: true,
    merge_sources: true,
    use_api_for_text: false,
  };
  
  // Run both in parallel
  const [apiResult, browserResult] = await Promise.allSettled([
    runAPISimulation({
      engine: input.engine,
      keyword: input.prompt,
      language: input.language,
      brand_domain: input.brand_domain,
      region: input.region,
    }),
    (async () => {
      const engine = getBrowserEngine(input.engine);
      return engine.runSimulation({
        prompt: input.prompt,
        language: input.language,
        region: input.region,
        brand_domain: input.brand_domain,
        options: input.browser_options,
      });
    })(),
  ]);
  
  const totalTime = Date.now() - startTime;
  
  // Handle failures gracefully
  const hasAPIResult = apiResult.status === 'fulfilled';
  const hasBrowserResult = browserResult.status === 'fulfilled';
  
  if (!hasAPIResult && !hasBrowserResult) {
    throw new Error('Both API and browser simulations failed');
  }
  
  // Merge results based on options
  let answer_html: string;
  let sources: SourceReference[];
  let search_context: SearchContext | undefined;
  
  if (hasBrowserResult && (!hasAPIResult || !options.use_api_for_text)) {
    // Use browser text
    answer_html = browserResult.value.answer_html;
  } else if (hasAPIResult) {
    // Use API text
    answer_html = apiResult.value.answer_html;
  } else {
    answer_html = '';
  }
  
  // Merge sources
  if (options.merge_sources && hasAPIResult && hasBrowserResult) {
    const apiSources = apiResult.value.sources;
    const browserSources = convertBrowserSourcesToStandard(browserResult.value);
    sources = mergeSources(apiSources, browserSources, options.prefer_browser_citations);
  } else if (options.prefer_browser_citations && hasBrowserResult) {
    sources = convertBrowserSourcesToStandard(browserResult.value);
  } else if (hasAPIResult) {
    sources = apiResult.value.sources;
  } else {
    sources = [];
  }
  
  // Build search context
  if (hasBrowserResult) {
    search_context = buildSearchContextFromBrowser(browserResult.value, input.prompt);
    if (hasAPIResult && apiResult.value.search_context) {
      // Merge search context
      search_context.results = [
        ...search_context.results,
        ...apiResult.value.search_context.results.filter(
          r => !search_context!.results.find(br => br.url === r.url)
        ),
      ];
    }
  } else if (hasAPIResult) {
    search_context = apiResult.value.search_context;
  }
  
  // Build result
  const result: HybridSimulationResult = {
    answer_html,
    sources,
    search_context,
    mode: 'hybrid',
    total_time_ms: totalTime,
  };
  
  // Add browser data if available
  if (hasBrowserResult) {
    const browser = browserResult.value;
    result.browser_data = {
      citations: browser.citations,
      search_chips: browser.search_chips,
      product_tiles: browser.product_tiles,
      source_cards: browser.source_cards,
      knowledge_panel: browser.knowledge_panel,
      suggested_followups: browser.suggested_followups,
      response_time_ms: browser.response_time_ms,
      was_logged_in: browser.was_logged_in,
    };
    result.browser_time_ms = browser.response_time_ms;
  }
  
  // Add API standardized result if available
  if (hasAPIResult && apiResult.value.standardized) {
    result.standardized = apiResult.value.standardized;
  }
  
  console.log(`[HybridFactory] Hybrid complete: API=${hasAPIResult}, Browser=${hasBrowserResult}, ${sources.length} sources`);
  
  return result;
}

// ===========================================
// Helpers
// ===========================================

function convertBrowserSourcesToStandard(browser: BrowserCaptureResult): SourceReference[] {
  const sources: SourceReference[] = [];
  const seenUrls = new Set<string>();
  
  // Add citations
  for (const citation of browser.citations) {
    if (!seenUrls.has(citation.url)) {
      seenUrls.add(citation.url);
      sources.push({
        url: citation.url,
        title: citation.title,
        snippet: citation.snippet,
        grounding_confidence: citation.is_inline ? 1.0 : 0.8,
      });
    }
  }
  
  // Add source cards
  for (const card of browser.source_cards) {
    if (!seenUrls.has(card.url)) {
      seenUrls.add(card.url);
      sources.push({
        url: card.url,
        title: card.title,
        snippet: card.snippet,
      });
    }
  }
  
  return sources;
}

function buildSearchContextFromBrowser(
  browser: BrowserCaptureResult,
  query: string
): SearchContext {
  const results = browser.citations.map((citation, index) => ({
    url: citation.url,
    title: citation.title,
    snippet: citation.snippet,
    score: index + 1,
    is_grounded: citation.is_inline,
  }));
  
  // Add source cards that aren't in citations
  const citationUrls = new Set(browser.citations.map(c => c.url));
  for (const card of browser.source_cards) {
    if (!citationUrls.has(card.url)) {
      results.push({
        url: card.url,
        title: card.title,
        snippet: card.snippet,
        score: results.length + 1,
        is_grounded: true,
      });
    }
  }
  
  return {
    query,
    results,
  };
}

function mergeSources(
  apiSources: SourceReference[],
  browserSources: SourceReference[],
  preferBrowser: boolean
): SourceReference[] {
  const merged = new Map<string, SourceReference>();
  
  // Add browser sources first if preferred
  const primary = preferBrowser ? browserSources : apiSources;
  const secondary = preferBrowser ? apiSources : browserSources;
  
  for (const source of primary) {
    merged.set(source.url, source);
  }
  
  for (const source of secondary) {
    if (!merged.has(source.url)) {
      merged.set(source.url, source);
    } else {
      // Merge additional data from secondary
      const existing = merged.get(source.url)!;
      if (!existing.snippet && source.snippet) {
        existing.snippet = source.snippet;
      }
      if (!existing.title && source.title) {
        existing.title = source.title;
      }
    }
  }
  
  return Array.from(merged.values());
}

// ===========================================
// Convenience Functions
// ===========================================

/**
 * Run API-only simulation (wrapper for existing factory)
 */
export async function runAPIOnlySimulation(
  engine: SupportedEngine,
  prompt: string,
  language: SupportedLanguage,
  region: SupportedRegion,
  brand_domain: string
): Promise<SimulationRawResult> {
  return runAPISimulation({
    engine,
    keyword: prompt,
    language,
    brand_domain,
    region,
  });
}

/**
 * Run browser-only simulation
 */
export async function runBrowserOnlySimulation(
  engine: SupportedEngine,
  prompt: string,
  language: SupportedLanguage,
  region: SupportedRegion,
  brand_domain: string,
  options?: BrowserOptions
): Promise<BrowserCaptureResult> {
  const browserEngine = getBrowserEngine(engine);
  return browserEngine.runSimulation({
    prompt,
    language,
    region,
    brand_domain,
    options,
  });
}

/**
 * Check if browser mode is available for an engine
 */
export function isBrowserModeAvailable(engine: SupportedEngine): boolean {
  // All engines currently support browser mode
  return ['chatgpt', 'perplexity', 'gemini', 'grok'].includes(engine);
}

/**
 * Get recommended mode for a use case
 */
export function getRecommendedMode(
  useCase: 'accuracy' | 'speed' | 'cost' | 'citations'
): BrowserSimulationMode {
  switch (useCase) {
    case 'accuracy':
    case 'citations':
      return 'browser'; // Best for real-world parity
    case 'speed':
    case 'cost':
      return 'api'; // Faster and cheaper
    default:
      return 'api';
  }
}

