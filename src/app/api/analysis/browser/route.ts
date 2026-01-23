/**
 * API: Browser-Based Analysis
 * 
 * Runs AI simulations using browser automation for real-world parity.
 * Captures DOM elements that APIs don't expose: citations, search chips,
 * product tiles, knowledge panels, etc.
 * 
 * Modes:
 * - 'browser': Full browser automation (slower, but exact human view)
 * - 'hybrid': API + browser combined (best of both worlds)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tasks } from "@trigger.dev/sdk/v3";
import type { 
  SupportedEngine, 
  SupportedLanguage, 
  SupportedRegion, 
  SimulationMode,
} from "@/types";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const authHeader = request.headers.get("authorization");
    const bearer =
      authHeader && authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice("bearer ".length).trim()
        : undefined;

    const {
      data: { user: cookieUser },
    } = await supabase.auth.getUser();

    let authedUser = cookieUser;
    if (!authedUser && bearer) {
      const { data } = await supabase.auth.getUser(bearer);
      authedUser = data.user;
    }

    if (!authedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    const { 
      brand_id, 
      prompt_set_id,
      prompt_ids,
      engines, 
      language,
      region = "global",
      simulation_mode = "browser",
    } = body as {
      brand_id: string;
      prompt_set_id?: string;
      prompt_ids?: string[];
      engines: SupportedEngine[];
      language: SupportedLanguage;
      region?: SupportedRegion;
      simulation_mode?: SimulationMode;
    };

    // Validate required fields
    if (!brand_id || (!prompt_set_id && (!prompt_ids || prompt_ids.length === 0)) || !engines || !language) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!Array.isArray(engines) || engines.length === 0) {
      return NextResponse.json(
        { error: "At least one engine must be selected" },
        { status: 400 }
      );
    }

    // Validate simulation mode
    if (!['browser', 'hybrid'].includes(simulation_mode)) {
      return NextResponse.json(
        { error: "Invalid simulation_mode. Use 'browser' or 'hybrid'" },
        { status: 400 }
      );
    }

    // Verify user has access to this brand
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", authedUser.id)
      .single();

    const { data: brand } = await supabase
      .from("brands")
      .select("*, organizations(*)")
      .eq("id", brand_id)
      .single();

    if (!brand || brand.organization_id !== profile?.organization_id) {
      return NextResponse.json(
        { error: "Brand not found or access denied" },
        { status: 404 }
      );
    }

    // Check tier - browser mode requires Pro or higher
    const organization = brand.organizations;
    const tier = organization.tier;
    
    if (!['pro', 'agency'].includes(tier)) {
      return NextResponse.json(
        { 
          error: "Browser automation requires Pro or Agency tier", 
          upgrade_required: true,
          current_tier: tier,
        },
        { status: 402 }
      );
    }

    // Check credits (browser mode costs 2x regular credits)
    if (organization.credits_balance <= 0) {
      return NextResponse.json(
        { error: "Insufficient credits. Please upgrade your plan." },
        { status: 402 }
      );
    }

    // Get prompt count
    let promptCount = 0;
    let promptIdList: string[] = [];
    
    if (prompt_ids && prompt_ids.length > 0) {
      promptCount = prompt_ids.length;
      promptIdList = prompt_ids;
    } else if (prompt_set_id) {
      const { data: prompts, count } = await supabase
        .from("prompts")
        .select("id", { count: "exact" })
        .eq("prompt_set_id", prompt_set_id);
      promptCount = count || 0;
      promptIdList = (prompts || []).map(p => p.id);
    }

    // Browser mode costs 2x (more resource intensive)
    const creditMultiplier = simulation_mode === 'hybrid' ? 3 : 2;
    const totalSimulations = promptCount * engines.length;
    const creditsRequired = totalSimulations * creditMultiplier;

    if (organization.credits_balance < creditsRequired) {
      return NextResponse.json(
        {
          error: `Insufficient credits. Browser mode requires ${creditsRequired} credits (${creditMultiplier}x regular). You have ${organization.credits_balance}.`,
        },
        { status: 402 }
      );
    }

    // Create the batch record
    const singlePromptId = (prompt_ids && prompt_ids.length === 1) ? prompt_ids[0] : null;
    
    const { data: batch, error: batchError } = await supabase
      .from("analysis_batches")
      .insert({
        brand_id,
        prompt_set_id: prompt_set_id || null,
        prompt_id: singlePromptId,
        status: "queued",
        engines,
        language,
        region,
        total_simulations: totalSimulations,
        completed_simulations: 0,
      })
      .select()
      .single();

    if (batchError) {
      return NextResponse.json(
        { error: batchError.message },
        { status: 500 }
      );
    }

    // Trigger the browser simulation batch job
    try {
      const handle = await tasks.trigger("batch-browser-simulation", {
        brand_id,
        prompt_ids: promptIdList,
        analysis_batch_id: batch.id,
        engines,
        language,
        region,
        mode: simulation_mode,
      });

      console.log("Triggered browser simulation job:", handle.id);
      
      // Update batch to processing
      await supabase
        .from("analysis_batches")
        .update({ status: "processing", started_at: new Date().toISOString() })
        .eq("id", batch.id);

    } catch (triggerError) {
      console.error("Failed to trigger browser simulation job:", triggerError);
      
      await supabase
        .from("analysis_batches")
        .update({ 
          status: "failed", 
          error_message: `Failed to trigger job: ${triggerError instanceof Error ? triggerError.message : 'Unknown error'}` 
        })
        .eq("id", batch.id);
      
      return NextResponse.json(
        { error: `Failed to start browser simulation: ${triggerError instanceof Error ? triggerError.message : 'Unknown error'}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      batch_id: batch.id,
      mode: simulation_mode,
      total_simulations: totalSimulations,
      credits_required: creditsRequired,
      message: `Browser-based analysis started (${simulation_mode} mode). This may take longer than API-based analysis.`,
      features: {
        captures_citations: true,
        captures_search_chips: true,
        captures_product_tiles: true,
        captures_knowledge_panels: true,
        captures_suggested_followups: true,
        uses_real_browser: true,
      },
    });

  } catch (error) {
    console.error("Browser analysis error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET: Check status of a browser simulation batch
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get("batch_id");

    if (!batchId) {
      return NextResponse.json(
        { error: "Missing batch_id parameter" },
        { status: 400 }
      );
    }

    // Get batch with browser-specific data
    const { data: batch, error } = await supabase
      .from("analysis_batches")
      .select(`
        *,
        simulations (
          id,
          engine,
          is_visible,
          status,
          selection_signals,
          error_message
        )
      `)
      .eq("id", batchId)
      .single();

    if (error || !batch) {
      return NextResponse.json(
        { error: "Batch not found" },
        { status: 404 }
      );
    }

    // Extract browser-specific metrics from simulations
    const browserMetrics = {
      total_citations: 0,
      total_source_cards: 0,
      total_search_chips: 0,
      knowledge_panels_found: 0,
      visible_count: 0,
    };

    for (const sim of batch.simulations || []) {
      if (sim.selection_signals?.browser_data) {
        const bd = sim.selection_signals.browser_data;
        browserMetrics.total_citations += bd.citation_count || 0;
        browserMetrics.total_source_cards += bd.source_card_count || 0;
        browserMetrics.total_search_chips += bd.search_chip_count || 0;
        if (bd.has_knowledge_panel) browserMetrics.knowledge_panels_found++;
      }
      if (sim.is_visible) browserMetrics.visible_count++;
    }

    return NextResponse.json({
      batch_id: batch.id,
      status: batch.status,
      total_simulations: batch.total_simulations,
      completed_simulations: batch.completed_simulations,
      progress: Math.round((batch.completed_simulations / batch.total_simulations) * 100),
      started_at: batch.started_at,
      completed_at: batch.completed_at,
      browser_metrics: browserMetrics,
      simulations: batch.simulations,
    });

  } catch (error) {
    console.error("Browser analysis status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

