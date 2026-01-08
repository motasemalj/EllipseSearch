import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get request body
    const { batch_id } = await request.json();

    if (!batch_id) {
      return NextResponse.json(
        { error: "Missing batch_id" },
        { status: 400 }
      );
    }

    // Get the batch and verify ownership
    const { data: batch, error: batchError } = await supabase
      .from("analysis_batches")
      .select("*, brands(organization_id)")
      .eq("id", batch_id)
      .single();

    if (batchError || !batch) {
      return NextResponse.json(
        { error: "Batch not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this brand's organization
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.organization_id !== batch.brands?.organization_id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Check if batch can be cancelled (only queued or processing)
    if (!["queued", "processing"].includes(batch.status)) {
      return NextResponse.json(
        { error: `Cannot cancel batch with status: ${batch.status}` },
        { status: 400 }
      );
    }

    // Update batch status to failed (with cancelled message)
    // Note: Using "failed" because database constraint doesn't include "cancelled"
    const { error: updateError } = await supabase
      .from("analysis_batches")
      .update({ 
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: "Cancelled by user"
      })
      .eq("id", batch_id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    // Refund credits for incomplete simulations
    const completedSimulations = batch.completed_simulations || 0;
    const totalSimulations = batch.total_simulations || 0;
    const refundCredits = totalSimulations - completedSimulations;

    if (refundCredits > 0) {
      // Get current credits balance
      const { data: org } = await supabase
        .from("organizations")
        .select("credits_balance")
        .eq("id", profile.organization_id)
        .single();

      if (org) {
        await supabase
          .from("organizations")
          .update({ 
            credits_balance: (org.credits_balance || 0) + refundCredits 
          })
          .eq("id", profile.organization_id);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Analysis cancelled",
      refunded_credits: refundCredits,
    });
  } catch (error) {
    console.error("Cancel analysis error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

