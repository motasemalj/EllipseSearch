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
import type { 
  SupportedEngine, 
  SupportedLanguage, 
  SupportedRegion,
  Sentiment,
  CitationAuthority,
} from "@/types";
import { thoroughVisibilityCheck } from "@/lib/ai/selection-signals";

// ===========================================
// Citation Authority Helpers
// ===========================================

/**
 * Calculate authority score based on domain characteristics
 */
function calculateAuthorityScore(domain: string): number {
  const domainLower = domain.toLowerCase();
  
  // High authority domains (70-100)
  const highAuthority = [
    'wikipedia.org', 'google.com', 'gov.', '.gov', '.edu',
    'nytimes.com', 'bbc.com', 'forbes.com', 'bloomberg.com',
    'reuters.com', 'wsj.com', 'techcrunch.com', 'theverge.com',
    'linkedin.com', 'youtube.com', 'amazon.com', 'microsoft.com',
    'apple.com', 'ibm.com', 'oracle.com', 'salesforce.com',
    'g2.com', 'capterra.com', 'trustpilot.com', 'clutch.co',
  ];
  
  for (const auth of highAuthority) {
    if (domainLower.includes(auth)) {
      return 75 + Math.floor(Math.random() * 20); // 75-95
    }
  }
  
  // Medium authority (40-70)
  const mediumAuthority = [
    'medium.com', 'reddit.com', 'quora.com', 'twitter.com', 'x.com',
    'crunchbase.com', 'glassdoor.com', 'indeed.com',
    '.ae', '.sa', '.qa', '.bh', '.kw', '.om', // Regional TLDs
  ];
  
  for (const auth of mediumAuthority) {
    if (domainLower.includes(auth)) {
      return 45 + Math.floor(Math.random() * 20); // 45-65
    }
  }
  
  // Default score for unknown domains
  return 30 + Math.floor(Math.random() * 25); // 30-55
}

/**
 * Determine source type from domain
 */
function getSourceType(domain: string): CitationAuthority['source_type'] {
  const domainLower = domain.toLowerCase();
  
  if (/news|times|post|journal|herald|tribune|bbc|cnn|reuters/.test(domainLower)) {
    return 'news';
  }
  if (/linkedin|facebook|twitter|x\.com|instagram/.test(domainLower)) {
    return 'social';
  }
  if (/g2|capterra|clutch|trustpilot|yelp|tripadvisor/.test(domainLower)) {
    return 'directory';
  }
  if (/blog|medium|substack|wordpress/.test(domainLower)) {
    return 'blog';
  }
  if (/reddit|quora|stackoverflow|forum/.test(domainLower)) {
    return 'forum';
  }
  if (/gov|edu|org/.test(domainLower)) {
    return 'official';
  }
  
  return 'editorial';
}

/**
 * Get authority tier from score
 */
function getAuthorityTier(score: number): CitationAuthority['tier'] {
  if (score >= 80) return 'authoritative';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    // If URL parsing fails, try to extract domain manually
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}

/**
 * Normalize domain for comparison
 */
function normalizeDomain(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.(com|ae|co|net|org|io|sa|qa|bh|kw|om).*$/, ''); // Remove TLD
}

/**
 * Check if a source domain matches the brand
 */
function isBrandMatch(
  sourceDomain: string,
  sourceUrl: string,
  brandDomain: string,
  brandAliases: string[]
): boolean {
  const sourceDomainLower = sourceDomain.toLowerCase();
  const sourceUrlLower = sourceUrl.toLowerCase();
  const brandDomainLower = brandDomain.toLowerCase().replace(/^www\./, '');
  const brandDomainNormalized = normalizeDomain(brandDomain);
  
  // 1. Direct domain match
  if (sourceDomainLower === brandDomainLower || sourceDomainLower === `www.${brandDomainLower}`) {
    return true;
  }
  
  // 2. Domain contains brand domain
  if (sourceDomainLower.includes(brandDomainLower) || brandDomainLower.includes(sourceDomainLower)) {
    return true;
  }
  
  // 3. Normalized match (without TLD)
  const sourceDomainNormalized = normalizeDomain(sourceDomain);
  if (sourceDomainNormalized === brandDomainNormalized || 
      sourceDomainNormalized.includes(brandDomainNormalized) ||
      brandDomainNormalized.includes(sourceDomainNormalized)) {
    return true;
  }
  
  // 4. URL contains brand domain
  if (sourceUrlLower.includes(brandDomainLower)) {
    return true;
  }
  
  // 5. Check aliases
  for (const alias of brandAliases) {
    const aliasLower = alias.toLowerCase();
    if (aliasLower.length > 2) {
      if (sourceDomainLower.includes(aliasLower) || sourceUrlLower.includes(aliasLower)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Create CitationAuthority objects from RPA sources
 */
function createCitationAuthorities(
  sources: Array<{ url: string; title: string; domain?: string; snippet?: string }>,
  brandDomain: string,
  brandAliases: string[]
): CitationAuthority[] {
  return sources.map(source => {
    const domain = source.domain || extractDomain(source.url);
    
    // Check if this is the brand's domain
    const isBrandDomain = isBrandMatch(domain, source.url, brandDomain, brandAliases);
    
    const authorityScore = isBrandDomain ? 100 : calculateAuthorityScore(domain);
    
    return {
      domain,
      authority_score: authorityScore,
      tier: getAuthorityTier(authorityScore),
      source_type: getSourceType(domain),
      is_brand_domain: isBrandDomain,
    };
  });
}

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

interface RPAPromptResult {
  prompt_id: string;
  prompt_text: string;
  engine: SupportedEngine;
  response_html: string;
  response_text: string;
  sources: Array<{
    url: string;
    title: string;
    domain: string;
    snippet?: string;
  }>;
  citation_count: number;
  is_visible: boolean;
  brand_mentions: string[];
  start_time: string;
  end_time: string;
  duration_seconds: number;
  success: boolean;
  error_message: string;
  run_id: string;
}

interface RPAWebhookPayload {
  event: "prompt_completed" | "run_completed";
  run_id: string;
  result?: RPAPromptResult;
  summary?: {
    total_prompts: number;
    successful: number;
    failed: number;
    visible_count: number;
    visibility_rate: number;
    by_engine: Record<string, { total: number; success: number; visible: number }>;
    started_at: string;
    completed_at: string;
  };
  timestamp: string;
  
  // Required metadata for storing
  brand_id?: string;
  analysis_batch_id?: string;
  language?: SupportedLanguage;
  region?: SupportedRegion;
  
  // For worker mode: direct update of existing simulation
  simulation_id?: string;
}

// ===========================================
// Main Handler
// ===========================================

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  
  try {
    // Verify webhook secret
    const authHeader = request.headers.get("authorization");
    const webhookSecret = process.env.RPA_WEBHOOK_SECRET;
    
    if (webhookSecret) {
      const providedSecret = authHeader?.replace("Bearer ", "");
      if (providedSecret !== webhookSecret) {
        return NextResponse.json(
          { error: "Invalid webhook secret" },
          { status: 401 }
        );
      }
    }
    
    const payload = await request.json() as RPAWebhookPayload;
    
    console.log(`[RPA Ingest] Received ${payload.event} from run ${payload.run_id}`);
    
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
    console.error("[RPA Ingest] Error:", error);
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
          error_message: result.error_message || "RPA execution failed" 
        })
        .eq("id", payload.simulation_id);
    }
    
    return NextResponse.json({ 
      success: true, 
      message: "Marked as failed",
      stored: false,
    });
  }
  
  // ENHANCED: Try to extract meaningful content from both HTML and text
  let responseHtml = result.response_html || "";
  let responseText = result.response_text || "";
  
  // If we have HTML but text is short/empty, try to extract text from HTML
  if (responseHtml.length > 50 && responseText.length < 30) {
    const extractedText = responseHtml
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    
    if (extractedText.length > responseText.length) {
      console.log(`[RPA Ingest] Extracted text from HTML: ${extractedText.length} chars (was ${responseText.length})`);
      responseText = extractedText;
    }
  }
  
  // Check for empty or very short responses
  const responseContent = responseHtml.length > responseText.length ? responseHtml : responseText;
  const minResponseLength = 20; // Minimum to consider valid
  
  if (responseContent.length < minResponseLength) {
    console.warn(`[RPA Ingest] Response too short (HTML: ${responseHtml.length}, Text: ${responseText.length}), marking as failed`);
    console.warn(`[RPA Ingest] First 200 chars of HTML: ${responseHtml.slice(0, 200)}`);
    console.warn(`[RPA Ingest] First 200 chars of Text: ${responseText.slice(0, 200)}`);
    
    if (payload.simulation_id) {
      await supabase
        .from("simulations")
        .update({ 
          status: "failed", 
          error_message: `Response extraction failed - content too short (HTML: ${responseHtml.length}, Text: ${responseText.length} chars). Check RPA browser screenshot for debugging.` 
        })
        .eq("id", payload.simulation_id);
    }
    
    return NextResponse.json({ 
      success: true, 
      message: "Response too short, marked as failed",
      stored: false,
      response_html_length: responseHtml.length,
      response_text_length: responseText.length,
      sample: responseContent.slice(0, 100),
    });
  }
  
  console.log(`[RPA Ingest] Processing response (HTML: ${responseHtml.length}, Text: ${responseText.length} chars)`);
  
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
    responseHtml || responseText || "",
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
  const citationAuthorities = createCitationAuthorities(
    result.sources,
    brandDomain,
    allAliases
  );
  
  const brandCitations = citationAuthorities.filter(c => c.is_brand_domain).length;
  console.log(`[RPA Ingest] Citation Authority: ${citationAuthorities.length} sources, ${brandCitations} brand citations`);
  
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
    ai_response_html: responseHtml || responseText, // Use enhanced content
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
        processed_html_length: responseHtml.length,
        processed_text_length: responseText.length,
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
    });
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
    // Verify webhook secret
    const authHeader = request.headers.get("authorization");
    const webhookSecret = process.env.RPA_WEBHOOK_SECRET;
    
    if (webhookSecret) {
      const providedSecret = authHeader?.replace("Bearer ", "");
      if (providedSecret !== webhookSecret) {
        return NextResponse.json(
          { error: "Invalid webhook secret" },
          { status: 401 }
        );
      }
    }
    
    const body = await request.json();
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

