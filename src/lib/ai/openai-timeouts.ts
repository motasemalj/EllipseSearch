/**
 * Centralized timeouts for LLM calls.
 *
 * These are set generously to handle:
 * - Concurrent ensemble runs (multiple parallel API calls)
 * - OpenAI API latency spikes
 * - Complex reasoning tasks
 * 
 * The Trigger.dev task has its own maxDuration for overall job timeout.
 */

export const LLM_TIMEOUTS_MS = {
  selectionSignals: 45_000,  // Complex analysis with schema
  aeoScoring: 45_000,        // Multi-factor scoring
  hallucination: 60_000,     // Ground truth comparison
  sentiment: 45_000,         // Multiple concurrent calls in ensemble
  brandExtraction: 45_000,   // Called per ensemble run, can stack
  groundTruthExtraction: 60_000, // Large content processing
} as const;


