/**
 * RPA Pending Jobs API
 * 
 * Returns simulations that are waiting for RPA processing.
 * The Python RPA script polls this endpoint to get work.
 * 
 * Flow:
 * 1. User triggers analysis with mode="rpa" in the platform UI
 * 2. Platform creates simulations with status="awaiting_rpa"
 * 3. RPA script polls GET /api/analysis/rpa-pending
 * 4. RPA processes each simulation and sends results to /api/analysis/rpa-ingest
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service role for RPA worker access
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  
  try {
    // Verify RPA webhook secret
    const authHeader = request.headers.get("authorization");
    const webhookSecret = process.env.RPA_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      return NextResponse.json(
        { error: "RPA_WEBHOOK_SECRET not configured on server" },
        { status: 500 }
      );
    }
    
    const providedSecret = authHeader?.replace("Bearer ", "");
    if (providedSecret !== webhookSecret) {
      return NextResponse.json(
        { error: "Invalid webhook secret" },
        { status: 401 }
      );
    }
    
    // Get query params
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const engine = searchParams.get("engine"); // Optional filter
    
    // Fetch pending RPA simulations
    // Note: RPA is primarily used for ChatGPT (best anti-bot protection needed)
    let query = supabase
      .from("simulations")
      .select(`
        id,
        prompt_id,
        prompt_text,
        engine,
        language,
        region,
        analysis_batch_id,
        brand_id,
        brands!inner (
          id,
          name,
          domain,
          brand_aliases
        )
      `)
      .eq("status", "awaiting_rpa")
      .order("created_at", { ascending: true })
      .limit(limit);
    
    // Filter by engine if specified, otherwise default to ChatGPT
    if (engine) {
      query = query.eq("engine", engine);
    } else {
      // By default, only return ChatGPT jobs (RPA is best for ChatGPT)
      query = query.eq("engine", "chatgpt");
    }
    
    const { data: simulations, error } = await query;
    
    if (error) {
      console.error("[RPA Pending] Query error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    // Transform to RPA-friendly format
    const pendingJobs = (simulations || []).map((sim: any) => ({
      simulation_id: sim.id,
      prompt_id: sim.prompt_id,
      prompt_text: sim.prompt_text,
      engine: sim.engine,
      language: sim.language,
      region: sim.region,
      analysis_batch_id: sim.analysis_batch_id,
      brand_id: sim.brand_id,
      brand_domain: sim.brands?.domain || "",
      brand_name: sim.brands?.name || "",
      brand_aliases: sim.brands?.brand_aliases || [],
    }));
    
    console.log(`[RPA Pending] Returning ${pendingJobs.length} pending jobs`);
    
    return NextResponse.json({
      success: true,
      count: pendingJobs.length,
      jobs: pendingJobs,
    });
    
  } catch (error) {
    console.error("[RPA Pending] Error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * Mark a simulation as "processing" (RPA has picked it up)
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  
  try {
    // Verify RPA webhook secret
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
    const { simulation_ids } = body;
    
    if (!simulation_ids || !Array.isArray(simulation_ids)) {
      return NextResponse.json(
        { error: "simulation_ids array required" },
        { status: 400 }
      );
    }
    
    // Mark simulations as processing
    const { error } = await supabase
      .from("simulations")
      .update({ status: "processing" })
      .in("id", simulation_ids)
      .eq("status", "awaiting_rpa"); // Only update if still awaiting
    
    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    console.log(`[RPA Pending] Marked ${simulation_ids.length} simulations as processing`);
    
    return NextResponse.json({
      success: true,
      marked: simulation_ids.length,
    });
    
  } catch (error) {
    console.error("[RPA Pending] Error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

