import { z } from "zod";
import type { SupportedEngine } from "@/types";

export const SupportedEngineSchema = z.enum([
  "chatgpt",
  "gemini",
  "grok",
  "perplexity",
] as const satisfies readonly SupportedEngine[]);

export const SupportedLanguageSchema = z.enum(["en", "ar"] as const);

export const SupportedRegionSchema = z.enum([
  "global",
  "us",
  "uk",
  "ae",
  "sa",
  "de",
  "fr",
  "in",
  "au",
  "ca",
  "jp",
  "sg",
  "br",
  "mx",
  "nl",
  "es",
  "it",
  "eg",
  "kw",
  "qa",
  "bh",
] as const);

export const AnalysisRunBodySchema = z
  .object({
    brand_id: z.string().uuid(),
    keyword_set_id: z.string().uuid().optional(),
    prompt_set_id: z.string().uuid().optional(),
    prompt_ids: z.array(z.string().uuid()).optional(),
    engines: z.array(SupportedEngineSchema).min(1),
    language: SupportedLanguageSchema.optional(), // Auto-detected if not provided
    region: SupportedRegionSchema.optional().default("global"),
    enable_hallucination_watchdog: z.boolean().optional(),
    simulation_mode: z.enum(["api", "rpa", "hybrid"]).optional(),
    schedule: z.enum(["daily", "weekly", "biweekly", "monthly", "1x_daily", "3x_daily", "6x_daily"]).optional(),
    // Ensemble options
    ensemble_run_count: z.number().int().min(1).max(15).optional().default(1),
    enable_variance_metrics: z.boolean().optional().default(false),
  })
  .strict();

export type AnalysisRunBody = z.infer<typeof AnalysisRunBodySchema>;

const RPASourceSchema = z
  .object({
    url: z.string().min(1),
    title: z.string().optional().default(""),
    domain: z.string().optional().default(""),
    snippet: z.string().optional(),
  })
  .strict();

const RPAPromptResultSchema = z
  .object({
    prompt_id: z.string().uuid(),
    prompt_text: z.string(),
    engine: SupportedEngineSchema,
    response_html: z.string().optional().default(""),
    response_text: z.string().optional().default(""),
    sources: z.array(RPASourceSchema).default([]),
    citation_count: z.number().int().nonnegative().optional().default(0),
    is_visible: z.boolean().optional().default(false),
    brand_mentions: z.array(z.string()).optional().default([]),
    start_time: z.string().optional().default(""),
    end_time: z.string().optional().default(""),
    duration_seconds: z.number().nonnegative().optional().default(0),
    success: z.boolean().optional().default(false),
    error_message: z.string().optional().default(""),
    // run_id is optional here since it's already in the parent payload
    run_id: z.string().optional().default(""),
  })
  .strict();

export const RPAWebhookPayloadSchema = z
  .object({
    event: z.enum(["prompt_completed", "run_completed"]),
    run_id: z.string(),
    result: RPAPromptResultSchema.optional(),
    summary: z
      .object({
        total_prompts: z.number().int().nonnegative(),
        successful: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        visible_count: z.number().int().nonnegative(),
        visibility_rate: z.number().nonnegative(),
        by_engine: z.record(
          z.string(),
          z.object({
            total: z.number().int().nonnegative(),
            success: z.number().int().nonnegative(),
            visible: z.number().int().nonnegative(),
          })
        ),
        started_at: z.string(),
        completed_at: z.string(),
      })
      .strict()
      .optional(),
    timestamp: z.string(),
    brand_id: z.string().uuid().optional(),
    analysis_batch_id: z.string().uuid().optional(),
    language: SupportedLanguageSchema.optional(),
    region: SupportedRegionSchema.optional(),
    simulation_id: z.string().uuid().optional(),
    // Allow additional fields from RPA worker (job_id, success at top level)
    job_id: z.string().optional(),
    success: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.event === "prompt_completed") {
      if (!val.result) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Missing result for prompt_completed" });
      if (!val.brand_id) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Missing brand_id for prompt_completed" });
    }
    if (val.event === "run_completed") {
      if (!val.summary) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Missing summary for run_completed" });
    }
  });

export type RPAWebhookPayload = z.infer<typeof RPAWebhookPayloadSchema>;


