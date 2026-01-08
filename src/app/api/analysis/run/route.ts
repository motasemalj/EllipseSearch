import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tasks } from "@trigger.dev/sdk/v3";
import type { RunAnalysisInput, SupportedEngine, SupportedLanguage, SupportedRegion } from "@/types";

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

    // If cookie-based auth failed, allow Bearer Supabase access token (API access)
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
      keyword_set_id, // Legacy support
      prompt_set_id,  // New name
      prompt_ids,     // For individual prompts (no set required)
      engines, 
      language,
      region = "global", // Default to global if not specified
      enable_hallucination_watchdog,
    } = body as {
      brand_id: string;
      keyword_set_id?: string;
      prompt_set_id?: string;
      prompt_ids?: string[];
      engines: SupportedEngine[];
      language: SupportedLanguage;
      region?: SupportedRegion;
      enable_hallucination_watchdog?: boolean;
    };

    // Use prompt_set_id if provided, fall back to keyword_set_id for backwards compatibility
    const setId = prompt_set_id || keyword_set_id;

    // Validate required fields
    if (!brand_id || (!setId && (!prompt_ids || prompt_ids.length === 0)) || !engines || !language) {
      return NextResponse.json(
        { error: "Missing required fields. Provide brand_id, engines, language, and either prompt_set_id or prompt_ids" },
        { status: 400 }
      );
    }

    if (!Array.isArray(engines) || engines.length === 0) {
      return NextResponse.json(
        { error: "At least one engine must be selected" },
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

    // Check credits
    const organization = brand.organizations;
    if (organization.credits_balance <= 0) {
      return NextResponse.json(
        { error: "Insufficient credits. Please upgrade your plan." },
        { status: 402 }
      );
    }

    // Get prompt count to estimate credits needed
    let promptCount = 0;
    
    if (prompt_ids && prompt_ids.length > 0) {
      promptCount = prompt_ids.length;
    } else if (setId) {
      const { count } = await supabase
        .from("prompts")
        .select("*", { count: "exact", head: true })
        .eq("prompt_set_id", setId);
      promptCount = count || 0;
    }

    const totalSimulations = promptCount * engines.length;

    if (organization.credits_balance < totalSimulations) {
      return NextResponse.json(
        {
          error: `Insufficient credits. Need ${totalSimulations} but have ${organization.credits_balance}`,
        },
        { status: 402 }
      );
    }

    // Create the batch record first
    // When running individual prompt analysis (single prompt_id), set prompt_id on the batch
    const singlePromptId = (prompt_ids && prompt_ids.length === 1) ? prompt_ids[0] : null;
    
    const { data: batch, error: batchError } = await supabase
      .from("analysis_batches")
      .insert({
        brand_id,
        prompt_set_id: setId || null, // Can be null for individual prompt analysis
        prompt_id: singlePromptId, // Set when running single prompt analysis
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

    // Trigger the background job
    const payload: RunAnalysisInput = {
      brand_id,
      prompt_set_id: setId,
      prompt_ids: prompt_ids,
      engines,
      language,
      region,
      enable_hallucination_watchdog: enable_hallucination_watchdog || false,
    };

    try {
      // Trigger via Trigger.dev
      const handle = await tasks.trigger("run-keyword-set-analysis", payload);
      console.log("Triggered job:", handle.id);
      
      // Update batch to processing
      await supabase
        .from("analysis_batches")
        .update({ status: "processing", started_at: new Date().toISOString() })
        .eq("id", batch.id);
    } catch (triggerError) {
      console.error("Failed to trigger job:", triggerError);
      // Update batch to failed
      await supabase
        .from("analysis_batches")
        .update({ 
          status: "failed", 
          error_message: `Failed to trigger job: ${triggerError instanceof Error ? triggerError.message : 'Unknown error'}` 
        })
        .eq("id", batch.id);
      
      return NextResponse.json(
        { error: `Failed to trigger job: ${triggerError instanceof Error ? triggerError.message : 'Unknown error'}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      batch_id: batch.id,
      total_simulations: totalSimulations,
      message: "Analysis started. Check back for results.",
    });
  } catch (error) {
    console.error("Analysis run error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

