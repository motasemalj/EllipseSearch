export const OPENAI_CHAT_MODEL =
  process.env.OPENAI_CHAT_MODEL ||
  process.env.OPENAI_MODEL ||
  "gpt-5.2";

// Model used specifically for "ChatGPT" engine simulation (aims to match ChatGPT output)
export const OPENAI_CHATGPT_SIM_MODEL =
  process.env.OPENAI_CHATGPT_SIM_MODEL ||
  "gpt-5.2-chat-latest";

// Whether the ChatGPT simulator is allowed to use live web search tooling.
// Default ON for production parity with real ChatGPT browsing behavior.
export const CHATGPT_SIM_ENABLE_WEB_SEARCH =
  (process.env.CHATGPT_SIM_ENABLE_WEB_SEARCH || "true").toLowerCase() === "true";

/**
 * Simulation Mode:
 * - "live": Uses web_search_preview (closest to real ChatGPT, but volatile)
 * - "stable": Uses web_search (more reproducible, uses cached/indexed data)
 * 
 * NOTE: gpt-5.2-chat-latest requires reasoning.effort: "medium" (no "none" option),
 * so temperature control is not available. Variance reduction is achieved through
 * ENSEMBLE RUNS instead of temperature settings.
 * 
 * For measurement-grade accuracy and fewer false flags, use ENSEMBLE_RUN_COUNT >= 5.
 * For closest-to-real-ChatGPT behavior, use "live" mode with ensemble.
 */
export type SimulationMode = "live" | "stable";
export const CHATGPT_SIM_MODE: SimulationMode = 
  (process.env.CHATGPT_SIM_MODE || "live") as SimulationMode;

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


