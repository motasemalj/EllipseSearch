import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Cleanup stuck analysis batches and simulations.
 * This handles runs that got stuck before the cancel feature was implemented.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Get request body for optional brand_id filter
    const body = await request.json().catch(() => ({}));
    const { brand_id } = body;

    // Find stuck batches (older than 30 minutes and still processing/queued/awaiting_rpa)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    let batchQuery = supabase
      .from("analysis_batches")
      .select("id, brand_id, status, created_at, brands(organization_id)")
      .in("status", ["queued", "processing", "awaiting_rpa"])
      .lt("created_at", thirtyMinutesAgo);
    
    if (brand_id) {
      batchQuery = batchQuery.eq("brand_id", brand_id);
    }
    
    const { data: stuckBatches, error: fetchError } = await batchQuery;

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // Filter to only batches in user's organization
    const userBatches = (stuckBatches || []).filter((batch) => {
      const brands = batch.brands as
        | { organization_id?: string | null }
        | { organization_id?: string | null }[]
        | null;
      const organizationId = Array.isArray(brands)
        ? brands[0]?.organization_id
        : brands?.organization_id;
      return organizationId === profile.organization_id;
    });

    if (userBatches.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No stuck batches found",
        cleaned_batches: 0,
        cleaned_simulations: 0,
      });
    }

    const batchIds = userBatches.map(b => b.id);

    // Cancel all stuck batches
    const { error: batchUpdateError } = await supabase
      .from("analysis_batches")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: "Cleaned up - was stuck for over 30 minutes"
      })
      .in("id", batchIds);

    if (batchUpdateError) {
      console.error("Failed to update batches:", batchUpdateError);
    }

    // Cancel all stuck simulations in these batches
    const { data: simResult, error: simUpdateError } = await supabase
      .from("simulations")
      .update({
        status: "failed",
        error_message: "Cleaned up - batch was stuck"
      })
      .in("analysis_batch_id", batchIds)
      .in("status", ["pending", "processing", "awaiting_rpa"])
      .select("id");

    if (simUpdateError) {
      console.error("Failed to update simulations:", simUpdateError);
    }

    const cleanedSimulations = simResult?.length || 0;

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${userBatches.length} stuck batch(es)`,
      cleaned_batches: userBatches.length,
      cleaned_simulations: cleanedSimulations,
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

