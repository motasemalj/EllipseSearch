// ===========================================
// OpenAI Model Configuration
// ===========================================

// Model used for all analysis, reasoning, and classification tasks
// gpt-5-nano provides excellent reasoning at lower cost
// IMPORTANT: Use a valid OpenAI model name (gpt-5-nano, gpt-4o-mini, gpt-4o, etc.)
export const OPENAI_CHAT_MODEL =
  process.env.OPENAI_CHAT_MODEL ||
  process.env.OPENAI_MODEL ||
  "gpt-5-nano";

// Model used specifically for "ChatGPT" engine simulation (aims to match ChatGPT output)
// o3-deep-research provides comprehensive research and resource gathering capabilities
export const OPENAI_CHATGPT_SIM_MODEL =
  process.env.OPENAI_CHATGPT_SIM_MODEL ||
  "o3-deep-research";

// ===========================================
// Reasoning Effort Configuration
// ===========================================

/**
 * Reasoning effort levels affect response quality, latency, and cost:
 * - "low": Fast, cheap, suitable for simple classification
 * - "medium": Balanced, good for most tasks (default for simulation)
 * - "high": Best quality, slower and more expensive (for accuracy-critical analysis)
 */
export type ReasoningEffort = "low" | "medium" | "high";

/**
 * Reasoning effort for ChatGPT simulation.
 * "medium" provides good balance between accuracy and speed.
 * Set to "high" for maximum fidelity to real ChatGPT reasoning.
 */
export const CHATGPT_SIMULATION_REASONING_EFFORT: ReasoningEffort =
  (process.env.CHATGPT_SIMULATION_REASONING_EFFORT || "medium") as ReasoningEffort;

/**
 * Reasoning effort for analysis tasks (brand extraction, sentiment, hallucination detection).
 * "high" recommended for production to maximize accuracy.
 */
export const ANALYSIS_REASONING_EFFORT: ReasoningEffort =
  (process.env.ANALYSIS_REASONING_EFFORT || "high") as ReasoningEffort;

/**
 * Reasoning effort for scoring tasks (AEO scoring, entity confidence).
 * "medium" is usually sufficient.
 */
export const SCORING_REASONING_EFFORT: ReasoningEffort =
  (process.env.SCORING_REASONING_EFFORT || "medium") as ReasoningEffort;

// ===========================================
// Web Search Configuration
// ===========================================

// Whether the ChatGPT simulator is allowed to use live web search tooling.
// Default ON for production parity with real ChatGPT browsing behavior.
export const CHATGPT_SIM_ENABLE_WEB_SEARCH =
  (process.env.CHATGPT_SIM_ENABLE_WEB_SEARCH || "true").toLowerCase() === "true";

/**
 * Simulation Mode:
 * - "live": Uses web_search_preview (closest to real ChatGPT, but volatile)
 * - "stable": Uses web_search (more reproducible, uses cached/indexed data)
 * 
 * NOTE: gpt-4o-mini supports standard temperature control for consistency.
 * For measurement-grade accuracy and fewer false flags, use ENSEMBLE_RUN_COUNT >= 5.
 * For closest-to-real-ChatGPT behavior, use "live" mode with ensemble.
 */
export type SimulationMode = "live" | "stable";
export const CHATGPT_SIM_MODE: SimulationMode = 
  (process.env.CHATGPT_SIM_MODE || "live") as SimulationMode;

// ===========================================
// Browser Simulation Configuration
// ===========================================

/**
 * Browser Simulation Mode:
 * - "api": Uses API calls only (fast, cost-effective)
 * - "browser": Uses Playwright browser automation (captures real DOM, citations, product tiles)
 * - "hybrid": Uses both API and browser, merging results for highest fidelity
 * - "rpa": Uses external RPA (headed browser) - creates simulation record and waits for
 *          results via webhook. Use this to bypass bot detection with your real Chrome session.
 * 
 * IMPORTANT: Browser mode captures what humans actually see, including:
 * - Live search chips
 * - Product tiles (shopping results)
 * - Inline citations with position tracking
 * - Knowledge panels
 * - Source cards
 * 
 * Set to "browser" or "hybrid" for real-world visibility measurement.
 * Set to "rpa" to use the external Python RPA script with your authenticated Chrome session.
 * 
 * Environment variable: BROWSER_SIMULATION_MODE
 * NOTE: Must be set in .env file (not .env.local) for Trigger.dev workers to pick it up
 */
export type BrowserSimulationMode = "api" | "browser" | "hybrid" | "rpa";

export const DEFAULT_BROWSER_SIMULATION_MODE: BrowserSimulationMode = 
  (process.env.BROWSER_SIMULATION_MODE || "api") as BrowserSimulationMode;

/**
 * Whether browser mode is enabled at all (master switch).
 * Set to false to completely disable browser automation even when mode is "browser".
 */
export const BROWSER_MODE_ENABLED =
  (process.env.BROWSER_MODE_ENABLED || "true").toLowerCase() === "true";

// ===========================================
// Ensemble Configuration
// ===========================================

/**
 * Number of ensemble runs per simulation.
 * Higher = better recall but more expensive.
 * Recommended: 5-9 runs for production, 1 for testing.
 */
export const ENSEMBLE_RUN_COUNT = 
  parseInt(process.env.ENSEMBLE_RUN_COUNT || "1", 10);

/**
 * Minimum ensemble runs (user cannot set below this)
 */
export const MIN_ENSEMBLE_RUNS = 1;

/**
 * Maximum ensemble runs (user cannot set above this)
 */
export const MAX_ENSEMBLE_RUNS = 15;

/**
 * Confidence thresholds for brand presence classification.
 * Based on ensemble frequency analysis.
 */
export const BRAND_CONFIDENCE_THRESHOLDS = {
  definite_present: 0.6,   // Brand appears in ≥60% of runs
  possible_present: 0.2,   // Brand appears in 20-59% of runs
  inconclusive: 0.01,      // Brand appears in 1-19% of runs
  likely_absent: 0,        // Brand appears in 0% of runs
} as const;

// ===========================================
// Caching Configuration
// ===========================================

/**
 * Whether to cache simulation results for identical queries.
 * Reduces API costs but may miss real-time changes.
 */
export const ENABLE_SIMULATION_CACHE =
  (process.env.ENABLE_SIMULATION_CACHE || "true").toLowerCase() === "true";

/**
 * Cache TTL in milliseconds (default: 1 hour)
 */
export const SIMULATION_CACHE_TTL_MS =
  parseInt(process.env.SIMULATION_CACHE_TTL_MS || String(60 * 60 * 1000), 10);

/**
 * Maximum cache entries
 */
export const SIMULATION_CACHE_MAX_SIZE =
  parseInt(process.env.SIMULATION_CACHE_MAX_SIZE || "1000", 10);
