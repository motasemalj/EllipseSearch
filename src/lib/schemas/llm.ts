/**
 * LLM Response Schemas - Strict Validation
 * 
 * All LLM responses must be validated through these schemas
 * to ensure consistent, reliable data structures.
 */

import { z } from "zod";

// ===========================================
// Sentiment Analysis Schema
// ===========================================

export const SentimentAnalysisSchema = z
  .object({
    polarity: z.number().min(-1).max(1),
    confidence: z.number().min(0).max(1),
    label: z.enum(["positive", "neutral", "negative"]),
    key_phrases: z
      .array(
        z.object({
          text: z.string(),
          sentiment: z.enum(["positive", "neutral", "negative"]),
          intensity: z.number().min(0).max(1),
        })
      )
      .max(10)
      .default([]),
    concerns: z.array(z.string().max(200)).max(10).default([]),
    praises: z.array(z.string().max(200)).max(10).default([]),
    context_quality: z.string().max(500).optional(),
  })
  .passthrough();

// ===========================================
// Hallucination Detection Schema
// ===========================================

export const HallucinationDetectionSchema = z
  .object({
    has_hallucinations: z.boolean(),
    accuracy_score: z.number().min(0).max(100),
    confidence: z.enum(["high", "medium", "low"]),
    summary: z.string().max(500),
    hallucinations: z
      .array(
        z.object({
          type: z.enum(["positive", "negative", "misattribution", "outdated"]),
          severity: z.enum(["critical", "major", "minor"]),
          claim: z.string().max(500),
          reality: z.string().max(500),
          // Models sometimes emit nulls for optional fields; accept and normalize.
          affected_element: z.string().max(100).nullable().optional(),
          specific_fix: z.string().max(500).nullable().optional(),
        })
      )
      .max(10)
      .default([]),
    analysis_notes: z.array(z.string().max(200)).max(10).default([]),
  })
  .passthrough();

// ===========================================
// Ground Truth Extraction Schema (Strict)
// ===========================================

export const PricingInfoSchema = z.object({
  plan_name: z.string().max(100),
  price: z.string().max(50),
  features: z.array(z.string().max(200)).max(20).optional(),
  is_free: z.boolean().optional(),
});

export const GroundTruthExtractionSchema = z.object({
  pricing: z.array(PricingInfoSchema).max(10).default([]),
  features: z.array(z.string().max(200)).max(50).default([]),
  products: z.array(z.string().max(100)).max(30).default([]),
  services: z.array(z.string().max(100)).max(30).default([]),
  company_description: z.string().max(1000).optional(),
  tagline: z.string().max(200).optional(),
  locations: z.array(z.string().max(200)).max(20).default([]),
  certifications: z.array(z.string().max(100)).max(20).default([]),
  faq_content: z.array(z.string().max(500)).max(30).default([]),
});

// Responses API schema format for ground truth
export const GROUND_TRUTH_RESPONSES_SCHEMA = {
  type: "json_schema",
  name: "ground_truth_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["pricing", "features", "products", "services", "company_description", "tagline", "locations", "certifications", "faq_content"],
    properties: {
      pricing: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["plan_name", "price", "features", "is_free"],
          properties: {
            plan_name: { type: "string", maxLength: 100 },
            price: { type: "string", maxLength: 50 },
            features: { 
              type: ["array", "null"], 
              maxItems: 20,
              items: { type: "string", maxLength: 200 }
            },
            is_free: { type: ["boolean", "null"] },
          },
        },
      },
      features: {
        type: "array",
        maxItems: 50,
        items: { type: "string", maxLength: 200 },
      },
      products: {
        type: "array",
        maxItems: 30,
        items: { type: "string", maxLength: 100 },
      },
      services: {
        type: "array",
        maxItems: 30,
        items: { type: "string", maxLength: 100 },
      },
      company_description: { type: ["string", "null"], maxLength: 1000 },
      tagline: { type: ["string", "null"], maxLength: 200 },
      locations: {
        type: "array",
        maxItems: 20,
        items: { type: "string", maxLength: 200 },
      },
      certifications: {
        type: "array",
        maxItems: 20,
        items: { type: "string", maxLength: 100 },
      },
      faq_content: {
        type: "array",
        maxItems: 30,
        items: { type: "string", maxLength: 500 },
      },
    },
  },
} as const;

// ===========================================
// Brand Extraction Schema
// ===========================================

export const BrandExtractionSchema = z.object({
  mentioned_brands: z.array(
    z.object({
      name: z.string().max(100),
      canonical_domain: z.string().max(100).nullable(),
      answer_spans: z.array(z.string().max(500)).max(10),
      citation_urls: z.array(z.string().url()).max(20),
      confidence: z.enum(["high", "medium", "low"]),
      mention_type: z.enum(["explicit", "partial", "fuzzy"]),
    })
  ).max(30),
  supported_brands: z.array(
    z.object({
      name: z.string().max(100),
      canonical_domain: z.string().max(100).nullable(),
      source_urls: z.array(z.string().url()).max(20),
      confidence: z.enum(["high", "medium", "low"]),
    })
  ).max(30),
  uncertainty_notes: z.array(z.string().max(200)).max(10),
});

// ===========================================
// AEO Scoring Schema
// ===========================================

export const AEOScoringSchema = z.object({
  accuracy_assessment: z.object({
    quality: z.enum(["accurate", "vague", "none"]),
    score: z.number().min(0).max(15),
    reasoning: z.string().max(500),
  }),
  misattribution_check: z.object({
    detected: z.boolean(),
    details: z.string().max(500),
  }),
});

// ===========================================
// Simulation Response Schema
// ===========================================

export const SourceReferenceSchema = z.object({
  url: z.string().url(),
  title: z.string().max(500).optional(),
  snippet: z.string().max(1000).optional(),
  grounding_confidence: z.number().min(0).max(1).optional(),
  is_x_post: z.boolean().optional(),
});

export const SimulationResponseSchema = z.object({
  answer_html: z.string().min(10),
  sources: z.array(SourceReferenceSchema),
});

// ===========================================
// Cross-Engine Visibility Schema
// ===========================================

export const CrossEngineVisibilitySchema = z.object({
  overall_confidence: z.enum(["high", "medium", "low"]),
  engines_visible: z.array(z.enum(["chatgpt", "gemini", "grok", "perplexity"])),
  engines_absent: z.array(z.enum(["chatgpt", "gemini", "grok", "perplexity"])),
  consensus_visibility: z.boolean(),
  disagreement_score: z.number().min(0).max(1),
});

// ===========================================
// Statistical Confidence Schema
// ===========================================

export const ConfidenceIntervalSchema = z.object({
  frequency: z.number().min(0).max(1),
  lower_bound: z.number().min(0).max(1),
  upper_bound: z.number().min(0).max(1),
  confidence_level: z.number().min(0).max(1),
  sample_size: z.number().int().positive(),
});

// ===========================================
// Ensemble Metrics Schema
// ===========================================

export const EnsembleMetricsSchema = z.object({
  run_count: z.number().int().positive(),
  successful_runs: z.number().int().min(0),
  brand_variance: z.number().min(0).max(1),
  confidence_interval: ConfidenceIntervalSchema.optional(),
  statistical_significance: z.boolean().optional(),
  p_value: z.number().min(0).max(1).optional(),
});

// ===========================================
// Type Exports
// ===========================================

export type SentimentAnalysisResult = z.infer<typeof SentimentAnalysisSchema>;
export type HallucinationDetectionResult = z.infer<typeof HallucinationDetectionSchema>;
export type GroundTruthExtractionResult = z.infer<typeof GroundTruthExtractionSchema>;
export type BrandExtractionResult = z.infer<typeof BrandExtractionSchema>;
export type AEOScoringResult = z.infer<typeof AEOScoringSchema>;
export type CrossEngineVisibility = z.infer<typeof CrossEngineVisibilitySchema>;
export type ConfidenceInterval = z.infer<typeof ConfidenceIntervalSchema>;
export type EnsembleMetrics = z.infer<typeof EnsembleMetricsSchema>;
