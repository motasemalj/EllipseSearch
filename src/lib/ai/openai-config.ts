// Model used for all analysis, reasoning, and classification tasks
// gpt-4o-mini provides excellent reasoning at lower cost
// IMPORTANT: Use a valid OpenAI model name (gpt-4o-mini, gpt-4-turbo, gpt-4o, etc.)
export const OPENAI_CHAT_MODEL =
  process.env.OPENAI_CHAT_MODEL ||
  process.env.OPENAI_MODEL ||
  "gpt-4o-mini"; // Changed from invalid "gpt-5-mini" to valid "gpt-4o-mini"

// Model used specifically for "ChatGPT" engine simulation (aims to match ChatGPT output)
export const OPENAI_CHATGPT_SIM_MODEL =
  process.env.OPENAI_CHATGPT_SIM_MODEL ||
  "gpt-4o-mini"; // Changed from invalid "gpt-5-mini" to valid "gpt-4o-mini"

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

/**
 * Number of ensemble runs per simulation.
 * Higher = better recall but more expensive.
 * Recommended: 5-9 runs for production, 1 for testing.
 */
export const ENSEMBLE_RUN_COUNT = 
  parseInt(process.env.ENSEMBLE_RUN_COUNT || "5", 10);

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


