/**
 * RPA Ingest API
 * 
 * Receives results from the Python RPA browser automation and:
 * 1. Stores them in the simulations table
 * 2. Runs selection signal analysis
 * 3. Updates visibility metrics
 * 
 * This endpoint bridges the headed browser RPA with the AEO analysis pipeline.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { tasks } from "@trigger.dev/sdk/v3";
import type { Sentiment } from "@/types";
import { thoroughVisibilityCheck } from "@/lib/ai/selection-signals";
import { buildCitationAuthorities } from "@/lib/ai/citation-authority";
import { sanitizeAiResponseForStorage } from "@/lib/security/sanitize-ai-html";
import { verifyWebhookAuth } from "@/lib/security/webhook";
import { RPAWebhookPayloadSchema, type RPAWebhookPayload } from "@/lib/schemas/api";
import { createRequestId, withLogContext } from "@/lib/logging/logger";
import { SIMULATION_PIPELINE_VERSION, VISIBILITY_CONTRACT_VERSION } from "@/lib/ai/versions";

// Use service role for webhook access
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ===========================================
// Types for RPA Webhook Payload
// ===========================================

// ===========================================
// Main Handler
// ===========================================

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  const request_id = request.headers.get("x-request-id") || createRequestId();
  const logger = withLogContext({ request_id, route: "rpa-ingest" });
  
  try {
    // Request size limit (prevents abuse / memory spikes)
    const rawBody = await request.text();
    const MAX_BODY_BYTES = 1_000_000; // 1MB
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    // Verify webhook auth (Bearer secret OR HMAC signature+timestamp)
    const authResult = verifyWebhookAuth({
      rawBody,
      authorizationHeader: request.headers.get("authorization"),
      timestampHeader: request.headers.get("x-webhook-timestamp"),
      signatureHeader: request.headers.get("x-webhook-signature"),
      bearerSecret: process.env.RPA_WEBHOOK_SECRET,
      hmacSecret: process.env.RPA_WEBHOOK_SECRET,
      maxSkewSeconds: 300,
    });

    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    // Parse + validate schema
    const json = JSON.parse(rawBody);
    const parsed = RPAWebhookPayloadSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    logger.info("Webhook received", { event: payload.event, run_id: payload.run_id, auth: authResult.mode });
    
    // Handle different event types
    if (payload.event === "prompt_completed" && payload.result) {
      return await handlePromptCompleted(supabase, payload);
    } else if (payload.event === "run_completed" && payload.summary) {
      return await handleRunCompleted(supabase, payload);
    } else {
      return NextResponse.json(
        { error: "Invalid event type or missing data" },
        { status: 400 }
      );
    }
    
  } catch (error) {
    logger.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

// ===========================================
// Handle Individual Prompt Result
// ===========================================

async function handlePromptCompleted(
  supabase: ReturnType<typeof getSupabase>,
  payload: RPAWebhookPayload
) {
  const result = payload.result!;
  const nowIso = new Date().toISOString();
  
  // Validate required metadata
  if (!payload.brand_id) {
    return NextResponse.json(
      { error: "Missing brand_id in payload" },
      { status: 400 }
    );
  }
  
  // Get brand details for analysis
  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .select("*")
    .eq("id", payload.brand_id)
    .single();
  
  if (brandError || !brand) {
    return NextResponse.json(
      { error: "Brand not found" },
      { status: 404 }
    );
  }
  
  // Log incoming result details for debugging
  console.log(`[RPA Ingest] Incoming result for ${result.engine}:`);
  console.log(`  - Success flag: ${result.success}`);
  console.log(`  - HTML length: ${result.response_html?.length || 0}`);
  console.log(`  - Text length: ${result.response_text?.length || 0}`);
  console.log(`  - Sources: ${result.sources?.length || 0}`);
  console.log(`  - Error: ${result.error_message || 'none'}`);
  
  // Skip failed results
  if (!result.success) {
    console.log(`[RPA Ingest] Skipping failed result for ${result.engine}: ${result.error_message}`);
    
    // Still update simulation status to failed
    if (payload.simulation_id) {
      await supabase
        .from("simulations")
        .update({ 
          status: "failed",
          error_message: result.error_message || "RPA execution failed",
          enrichment_status: "failed",
          enrichment_error: result.error_message || "RPA execution failed",
          enrichment_completed_at: nowIso,
          analysis_stage: `failed:${result.engine}`,
        })
        .eq("id", payload.simulation_id);
    }

    // Count failures as completed work for batch progress (best-effort)
    if (payload.analysis_batch_id) {
      try {
        await supabase.rpc("increment_batch_completed", { batch_id: payload.analysis_batch_id });
      } catch {
        // ignore
      }

      // Debounced batch finalization so UI can move on
      try {
        await tasks.trigger(
          "finalize-analysis-batch",
          { analysis_batch_id: payload.analysis_batch_id },
          { debounce: { key: `finalize-${payload.analysis_batch_id}`, delay: "10s", mode: "trailing" } }
        );
      } catch {
        // ignore
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      message: "Marked as failed",
      stored: false,
    });
  }
  
  // ENHANCED + SAFE: normalize to plain text and store only safe HTML derived from text
  const { safe_html: safeHtml, plain_text: plainText } = sanitizeAiResponseForStorage({
    html: result.response_html || "",
    text: result.response_text || "",
    maxTextChars: 25_000,
  });

  // Check for empty or very short responses (use text, not HTML)
  const minResponseLength = 20;
  if (plainText.length < minResponseLength) {
    const rawHtml = result.response_html || "";
    const rawText = result.response_text || "";
    console.warn(`[RPA Ingest] Response too short (HTML: ${rawHtml.length}, Text: ${rawText.length}), marking as failed`);
    console.warn(`[RPA Ingest] First 200 chars of HTML: ${rawHtml.slice(0, 200)}`);
    console.warn(`[RPA Ingest] First 200 chars of Text: ${rawText.slice(0, 200)}`);
    
    if (payload.simulation_id) {
      await supabase
        .from("simulations")
        .update({ 
          status: "failed",
          error_message: `Response extraction failed - content too short (HTML: ${(result.response_html || "").length}, Text: ${(result.response_text || "").length} chars). Check RPA browser screenshot for debugging.`,
          enrichment_status: "failed",
          enrichment_error: "RPA response too short (likely login page / extraction failure)",
          enrichment_completed_at: nowIso,
          analysis_stage: `failed:${result.engine}`,
        })
        .eq("id", payload.simulation_id);
    }

    // Count as completed work for batch progress so UI doesn't get stuck
    if (payload.analysis_batch_id) {
      try {
        await supabase.rpc("increment_batch_completed", { batch_id: payload.analysis_batch_id });
      } catch {
        // ignore
      }

      try {
        await tasks.trigger(
          "finalize-analysis-batch",
          { analysis_batch_id: payload.analysis_batch_id },
          { debounce: { key: `finalize-${payload.analysis_batch_id}`, delay: "10s", mode: "trailing" } }
        );
      } catch {
        // ignore
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      message: "Response too short, marked as failed",
      stored: false,
      response_html_length: (result.response_html || "").length,
      response_text_length: (result.response_text || "").length,
      sample: plainText.slice(0, 100),
    });
  }
  
  console.log(`[RPA Ingest] Processing response (text: ${plainText.length} chars)`);
  
  // Build comprehensive brand identifiers for checking
  const brandName = brand.name || "";
  const brandDomain = brand.domain || "";
  const brandAliases = brand.brand_aliases || [];
  
  // Also add common variations of the brand name
  const allAliases = [...brandAliases];
  if (brandName) {
    // Add brand name variations
    allAliases.push(brandName);
    // Remove common suffixes for matching (e.g., "DAMAC Properties" -> "DAMAC")
    const simplified = brandName.replace(/properties|realty|real estate|group|holdings|development|developers|uae|dubai/gi, '').trim();
    if (simplified.length > 2 && !allAliases.includes(simplified)) {
      allAliases.push(simplified);
    }
  }
  
  // First do a quick visibility check on the raw response
  // ENHANCED: Use the best available content (extracted if needed)
  const visibilityCheck = thoroughVisibilityCheck(
    safeHtml || plainText || "",
    brandDomain,
    allAliases,
    brandName
  );
  
  console.log(`[RPA Ingest] Quick visibility check: ${visibilityCheck.isVisible ? "VISIBLE" : "NOT VISIBLE"}`);
  if (visibilityCheck.mentions.length > 0) {
    console.log(`[RPA Ingest]   Mentions found: ${visibilityCheck.mentions.join(", ")}`);
  }
  
  // Prepare search context from sources
  const searchContext = result.sources.length > 0 ? {
    query: result.prompt_text,
    results: result.sources.map(s => ({
      url: s.url,
      title: s.title,
      snippet: s.snippet || "",
    })),
  } : null;
  
  // Use quick visibility check for immediate response
  // Full GPT analysis will run in background via Trigger.dev
  const isVisible = visibilityCheck.isVisible || result.is_visible;
  
  // Create citation authorities from RPA sources
  const citationAuthorities = buildCitationAuthorities(result.sources, brandDomain, allAliases);
  
  const brandCitations = citationAuthorities.filter(c => c.is_brand_domain).length;
  console.log(`[RPA Ingest] Citation Authority: ${citationAuthorities.length} sources, ${brandCitations} brand citations`);
  
  // Preserve existing selection signals (if this is an update)
  let existingSignals: Record<string, unknown> | null = null;
  if (payload.simulation_id) {
    const { data: existingSim } = await supabase
      .from("simulations")
      .select("selection_signals")
      .eq("id", payload.simulation_id)
      .single();

    existingSignals = (existingSim?.selection_signals as Record<string, unknown>) || null;
  }

  const existingWatchdog = (existingSignals as { hallucination_watchdog?: { enabled?: boolean; no_ground_truth?: boolean } } | null)
    ?.hallucination_watchdog;
  const watchdogEnabled = existingWatchdog?.enabled === true;

  // Prepare simulation record with basic data (fast)
  // Full GPT analysis will be added by background job
  // ENHANCED: Use the enhanced/extracted response content
  const simulationData = {
    brand_id: payload.brand_id,
    prompt_id: result.prompt_id,
    analysis_batch_id: payload.analysis_batch_id || null,
    engine: result.engine,
    language: payload.language || "en",
    region: payload.region || "global",
    prompt_text: result.prompt_text,
    ai_response_html: safeHtml, // ALWAYS safe HTML (prevents XSS)
    search_context: searchContext,
    is_visible: isVisible,
    sentiment: (isVisible ? "neutral" : "negative") as Sentiment,
    selection_signals: {
      source: "rpa",
      rpa_run_id: payload.run_id,
      is_visible: isVisible,
      sentiment: (isVisible ? "neutral" : "negative") as Sentiment,
      winning_sources: result.sources.map(s => s.url),
      citation_authorities: citationAuthorities,
      brand_mentions: visibilityCheck.mentions,
      brand_citations: brandCitations,
      visibility_contract_version: VISIBILITY_CONTRACT_VERSION,
      simulation_pipeline_version: SIMULATION_PIPELINE_VERSION,
      meta: {
        engine: result.engine,
        provider: "rpa",
        model: "chatgpt-ui",
        simulation_mode: "rpa",
      },
      visibility: {
        visible_in_text: visibilityCheck.mentions.length > 0,
        visible_in_sources: brandCitations > 0,
        visible_probability: isVisible ? 1 : 0,
        reason: visibilityCheck.mentions.length > 0 ? "mentioned_in_text" : brandCitations > 0 ? "cited_in_sources" : "absent",
      },
      hallucination_watchdog: existingWatchdog
        ? { ...existingWatchdog, enabled: watchdogEnabled, result: null }
        : { enabled: false, result: null },
      gap_analysis: {
        structure_score: 3,
        data_density_score: 3,
        directness_score: 3,
      },
      recommendation: "Analysis in progress...",
      // Flag for background job to know analysis is pending
      analysis_pending: true,
      // ENHANCED: Store extraction metadata for debugging
      rpa_extraction_stats: {
        original_html_length: result.response_html?.length || 0,
        original_text_length: result.response_text?.length || 0,
        processed_html_length: safeHtml.length,
        processed_text_length: plainText.length,
      },
    },
    status: "processing", // Will be set to completed after GPT analysis
  };
  
  console.log(`[RPA Ingest] Storing: visible=${isVisible}, engine=${result.engine}, citations=${citationAuthorities.length}`);
  
  // Update or insert simulation
  let simulation;
  
  if (payload.simulation_id) {
    // Worker mode: update existing simulation that was awaiting_rpa
    const { data, error } = await supabase
      .from("simulations")
      .update(simulationData)
      .eq("id", payload.simulation_id)
      .select()
      .single();
    
    if (error) {
      console.error("[RPA Ingest] Failed to update simulation:", error);
      return NextResponse.json(
        { error: "Failed to update simulation" },
        { status: 500 }
      );
    }
    simulation = data;
    console.log(`[RPA Ingest] Updated existing simulation ${payload.simulation_id}`);
  } else {
    // Direct mode: upsert new simulation
    const { data, error } = await supabase
      .from("simulations")
      .upsert(simulationData, {
        onConflict: payload.analysis_batch_id 
          ? "analysis_batch_id,prompt_id,engine"
          : undefined,
      })
      .select()
      .single();
    
    if (error) {
      console.error("[RPA Ingest] Failed to store simulation:", error);
      return NextResponse.json(
        { error: "Failed to store simulation" },
        { status: 500 }
      );
    }
    simulation = data;
  }
  
  // Update prompt last_checked_at
  await supabase
    .from("prompts")
    .update({ last_checked_at: new Date().toISOString() })
    .eq("id", result.prompt_id);
  
  // Trigger background job for full GPT analysis
  // This runs asynchronously so the webhook can respond quickly
  try {
    await tasks.trigger("analyze-rpa-simulation", {
      simulation_id: simulation.id,
      brand_id: payload.brand_id,
      prompt_id: result.prompt_id,
      analysis_batch_id: payload.analysis_batch_id,
      engine: result.engine,
      language: payload.language || "en",
      region: payload.region || "global",
    }, { idempotencyKey: `analyze-rpa-${simulation.id}` });
    console.log(`[RPA Ingest] Triggered background analysis for simulation ${simulation.id}`);
  } catch (triggerError) {
    console.error("[RPA Ingest] Failed to trigger background analysis:", triggerError);
    // Don't fail the request - data is stored, analysis can be retried
  }
  
  return NextResponse.json({
    success: true,
    simulation_id: simulation.id,
    is_visible: isVisible,
    analysis_triggered: true,
    message: "Result stored, analysis running in background",
  });
}

// ===========================================
// Handle Run Completed (Summary)
// ===========================================

async function handleRunCompleted(
  supabase: ReturnType<typeof getSupabase>,
  payload: RPAWebhookPayload
) {
  const summary = payload.summary!;
  
  console.log(`[RPA Ingest] Run ${payload.run_id} completed:`);
  console.log(`  Total: ${summary.total_prompts}`);
  console.log(`  Successful: ${summary.successful}`);
  console.log(`  Visible: ${summary.visible_count} (${(summary.visibility_rate * 100).toFixed(1)}%)`);
  
  // If there's a batch, mark it as completed
  if (payload.analysis_batch_id) {
    await supabase
      .from("analysis_batches")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_simulations: summary.successful,
      })
      .eq("id", payload.analysis_batch_id);
  }
  
  return NextResponse.json({
    success: true,
    message: "Run summary recorded",
    summary: {
      total: summary.total_prompts,
      successful: summary.successful,
      visibility_rate: summary.visibility_rate,
    },
  });
}

// ===========================================
// Batch Creation Endpoint (for RPA to call first)
// ===========================================

export async function PUT(request: NextRequest) {
  const supabase = getSupabase();
  
  try {
    const rawBody = await request.text();
    const MAX_BODY_BYTES = 200_000;
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    const authResult = verifyWebhookAuth({
      rawBody,
      authorizationHeader: request.headers.get("authorization"),
      timestampHeader: request.headers.get("x-webhook-timestamp"),
      signatureHeader: request.headers.get("x-webhook-signature"),
      bearerSecret: process.env.RPA_WEBHOOK_SECRET,
      hmacSecret: process.env.RPA_WEBHOOK_SECRET,
      maxSkewSeconds: 300,
    });
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    
    const body = JSON.parse(rawBody);
    const { 
      brand_id, 
      prompt_ids, 
      engines, 
      language = "en", 
      region = "global",
      run_id,
    } = body;
    
    if (!brand_id || !prompt_ids || !engines) {
      return NextResponse.json(
        { error: "Missing brand_id, prompt_ids, or engines" },
        { status: 400 }
      );
    }
    
    // Create batch record for RPA run
    const totalSimulations = prompt_ids.length * engines.length;
    
    const { data: batch, error: batchError } = await supabase
      .from("analysis_batches")
      .insert({
        brand_id,
        prompt_set_id: null,  // RPA runs may not have a set
        status: "processing",
        engines,
        language,
        region,
        total_simulations: totalSimulations,
        completed_simulations: 0,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (batchError) {
      return NextResponse.json(
        { error: batchError.message },
        { status: 500 }
      );
    }
    
    console.log(`[RPA Ingest] Created batch ${batch.id} for RPA run ${run_id}`);
    
    return NextResponse.json({
      success: true,
      batch_id: batch.id,
      total_simulations: totalSimulations,
    });
    
  } catch (error) {
    console.error("[RPA Ingest] Batch creation error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

