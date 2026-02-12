/**
 * API: /api/brands/[brandId]/prompts
 * 
 * Handles prompt creation with intelligent batch sync logic.
 * 
 * KEY RULES:
 * 1. New prompts are analyzed immediately to sync up with the batch cycle
 * 2. If new prompts are within 1 hour of the next batch run, they skip that run
 *    and follow the timing of the batch run after it
 * 3. Mark prompts with first_analyzed_at for tracking
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { tasks } from "@trigger.dev/sdk/v3";
import type { SupportedEngine, SupportedLanguage, SupportedRegion } from "@/types";
import { isRpaAvailable } from "@/lib/rpa/status";

type RouteParams = { params: Promise<{ brandId: string }> };

// 1-hour window threshold in milliseconds
const WINDOW_THRESHOLD_MS = 60 * 60 * 1000;

/**
 * GET /api/brands/[brandId]/prompts
 * List all prompts for a brand
 */
export async function GET(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const { brandId } = await context.params;
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this brand
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const { data: brand } = await supabase
      .from("brands")
      .select("id, organization_id")
      .eq("id", brandId)
      .single();

    if (!brand || brand.organization_id !== profile?.organization_id) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    // Get all prompts
    const { data: prompts, error } = await supabase
      .from("prompts")
      .select("*")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ prompts });

  } catch (error) {
    console.error("List prompts error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/brands/[brandId]/prompts
 * Add new prompts with intelligent batch sync
 * 
 * Body: {
 *   prompts: string[] | { text: string }[],
 *   prompt_set_id?: string,
 *   run_analysis?: boolean,  // Default true if daily_analyses_enabled
 * }
 */
export async function POST(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const { brandId } = await context.params;
    const supabase = await createClient();
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    const { 
      prompts: inputPrompts,
      prompt_set_id,
      run_analysis,
    } = body as {
      prompts: string[] | { text: string }[];
      prompt_set_id?: string;
      run_analysis?: boolean;
    };

    if (!inputPrompts || !Array.isArray(inputPrompts) || inputPrompts.length === 0) {
      return NextResponse.json(
        { error: "Prompts array is required" },
        { status: 400 }
      );
    }

    // Normalize prompts to array of texts
    const promptTexts = inputPrompts.map(p => 
      typeof p === 'string' ? p.trim() : p.text?.trim()
    ).filter(Boolean);

    if (promptTexts.length === 0) {
      return NextResponse.json(
        { error: "No valid prompts provided" },
        { status: 400 }
      );
    }

    // Verify user has access to this brand
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select(`
        *,
        organizations (
          id,
          tier
        )
      `)
      .eq("id", brandId)
      .single();

    if (brandError || !brand || brand.organization_id !== profile?.organization_id) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const now = new Date();
    
    // Get daily analyses status
    const dailyAnalysesEnabled = brand.daily_analyses_enabled || false;
    const nextDailyRunAt = brand.next_daily_run_at ? new Date(brand.next_daily_run_at) : null;
    
    // Determine engines to use
    const engines: SupportedEngine[] = brand.analysis_engines || ['chatgpt', 'perplexity', 'gemini', 'grok'];
    const language: SupportedLanguage = (brand.languages?.[0] as SupportedLanguage) || 'en';
    const region: SupportedRegion = (brand.primary_location as SupportedRegion) || 'global';

    // Check if we should run analysis
    // Default: run if daily_analyses_enabled is true
    const shouldRunAnalysis = run_analysis !== undefined 
      ? run_analysis 
      : dailyAnalysesEnabled;

    // Check 1-hour window rule
    // If next batch run is within 1 hour, skip immediate analysis
    let skipImmediateForBatchSync = false;
    if (nextDailyRunAt && dailyAnalysesEnabled) {
      const timeUntilNextRun = nextDailyRunAt.getTime() - now.getTime();
      if (timeUntilNextRun > 0 && timeUntilNextRun <= WINDOW_THRESHOLD_MS) {
        skipImmediateForBatchSync = true;
        console.log(`[Prompts API] Within 1-hour window of next batch run (${Math.round(timeUntilNextRun / 60000)}min) - skipping immediate analysis`);
      }
    }

    // Insert prompts
    const promptsToInsert = promptTexts.map(text => ({
      brand_id: brandId,
      prompt_set_id: prompt_set_id || null,
      text,
      is_active: true,
      // Don't set first_analyzed_at yet - will be set when actually analyzed
    }));

    const { data: insertedPrompts, error: insertError } = await supabase
      .from("prompts")
      .insert(promptsToInsert)
      .select();

    if (insertError) {
      console.error("Prompt insertion error:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    const addedCount = insertedPrompts?.length || 0;
    const newPromptIds = insertedPrompts?.map(p => p.id) || [];

    // Run immediate analysis if applicable
    let analysisTriggered = false;
    let analysisBatchId: string | null = null;

    if (shouldRunAnalysis && !skipImmediateForBatchSync && newPromptIds.length > 0) {
      const totalSimulations = newPromptIds.length * engines.length;

      {
        try {
          // Check RPA availability
          const rpaStatus = await isRpaAvailable();
          const rpaAvailableForChatGPT = rpaStatus.available && rpaStatus.engines.includes('chatgpt');

          // Split engines
          const rpaEngines: SupportedEngine[] = [];
          const apiEngines: SupportedEngine[] = [];

          for (const engine of engines) {
            if (engine === 'chatgpt' && rpaAvailableForChatGPT) {
              rpaEngines.push(engine);
            } else {
              apiEngines.push(engine);
            }
          }

          const hasRpaWork = rpaEngines.length > 0;
          const hasApiWork = apiEngines.length > 0;
          const batchStatus = hasRpaWork && !hasApiWork ? "awaiting_rpa" : "processing";

          // Create analysis batch
          const { data: batch, error: batchError } = await supabaseAdmin
            .from("analysis_batches")
            .insert({
              brand_id: brandId,
              prompt_set_id: prompt_set_id || null,
              prompt_id: newPromptIds.length === 1 ? newPromptIds[0] : null,
              status: batchStatus,
              engines,
              language,
              region,
              total_simulations: totalSimulations,
              completed_simulations: 0,
              started_at: now.toISOString(),
            })
            .select()
            .single();

          if (!batchError && batch) {
            analysisBatchId = batch.id;

            // Create RPA simulations if needed
            if (hasRpaWork) {
              const rpaSimulations = insertedPrompts?.flatMap(prompt =>
                rpaEngines.map(engine => ({
                  brand_id: brandId,
                  prompt_id: prompt.id,
                  prompt_text: prompt.text,
                  analysis_batch_id: batch.id,
                  engine,
                  language,
                  region,
                  status: "awaiting_rpa",
                }))
              ) || [];

              if (rpaSimulations.length > 0) {
                await supabaseAdmin.from("simulations").insert(rpaSimulations);
              }
            }

            // Trigger API analysis if needed
            if (hasApiWork) {
              await tasks.trigger("run-keyword-set-analysis", {
                brand_id: brandId,
                prompt_set_id: prompt_set_id || undefined,
                prompt_ids: newPromptIds,
                engines: apiEngines,
                language,
                region,
                enable_hallucination_watchdog: false,
                simulation_mode: 'api',
              });
            }

            // Mark prompts as analyzed
            await supabaseAdmin
              .from("prompts")
              .update({ first_analyzed_at: now.toISOString() })
              .in("id", newPromptIds);

            analysisTriggered = true;
            console.log(`[Prompts API] Triggered immediate analysis for ${newPromptIds.length} prompts`);
          }

        } catch (analysisError) {
          console.error("Analysis trigger error:", analysisError);
          // Don't fail the request - prompts were added successfully
        }
      }
    }

    // Build response message
    let message = `Added ${addedCount} prompt${addedCount !== 1 ? 's' : ''}`;
    if (analysisTriggered) {
      message += ". Analysis started.";
    } else if (skipImmediateForBatchSync) {
      message += ". Will be analyzed in the next scheduled batch.";
    }

    return NextResponse.json({
      success: true,
      added_count: addedCount,
      prompts: insertedPrompts,
      analysis: {
        triggered: analysisTriggered,
        batch_id: analysisBatchId,
        skipped_for_batch_sync: skipImmediateForBatchSync,
        next_batch_run_at: nextDailyRunAt?.toISOString() || null,
      },
      message,
    });

  } catch (error) {
    console.error("Add prompts error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/brands/[brandId]/prompts
 * Delete prompts
 * 
 * Body: { prompt_ids: string[] }
 */
export async function DELETE(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const { brandId } = await context.params;
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    const { prompt_ids } = body as { prompt_ids: string[] };

    if (!prompt_ids || !Array.isArray(prompt_ids) || prompt_ids.length === 0) {
      return NextResponse.json(
        { error: "prompt_ids array is required" },
        { status: 400 }
      );
    }

    // Verify user has access to this brand
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const { data: brand } = await supabase
      .from("brands")
      .select("id, organization_id")
      .eq("id", brandId)
      .single();

    if (!brand || brand.organization_id !== profile?.organization_id) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    // Soft delete by setting is_active = false (preserves history)
    const { error: deleteError, count } = await supabase
      .from("prompts")
      .update({ is_active: false })
      .eq("brand_id", brandId)
      .in("id", prompt_ids)
      .select();

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deleted_count: count || prompt_ids.length,
    });

  } catch (error) {
    console.error("Delete prompts error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/brands/[brandId]/prompts
 * Update prompt(s)
 * 
 * Body: { prompt_id: string, text?: string, is_active?: boolean }
 *    OR { prompt_ids: string[], is_active: boolean }
 */
export async function PATCH(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const { brandId } = await context.params;
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    const { prompt_id, prompt_ids, text, is_active } = body as {
      prompt_id?: string;
      prompt_ids?: string[];
      text?: string;
      is_active?: boolean;
    };

    // Verify user has access to this brand
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const { data: brand } = await supabase
      .from("brands")
      .select("id, organization_id")
      .eq("id", brandId)
      .single();

    if (!brand || brand.organization_id !== profile?.organization_id) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    // Build update
    const updates: Record<string, unknown> = {};
    if (text !== undefined) updates.text = text;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    // Single prompt update
    if (prompt_id) {
      const { data: updated, error } = await supabase
        .from("prompts")
        .update(updates)
        .eq("id", prompt_id)
        .eq("brand_id", brandId)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, prompt: updated });
    }

    // Bulk update
    if (prompt_ids && prompt_ids.length > 0) {
      const { error, count } = await supabase
        .from("prompts")
        .update(updates)
        .eq("brand_id", brandId)
        .in("id", prompt_ids);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, updated_count: count });
    }

    return NextResponse.json({ error: "prompt_id or prompt_ids required" }, { status: 400 });

  } catch (error) {
    console.error("Update prompts error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

