import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET - List all scheduled analyses for a brand
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get("brand_id");

    if (!brandId) {
      return NextResponse.json({ error: "brand_id is required" }, { status: 400 });
    }

    // Verify user has access to this brand
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const { data: brand } = await supabase
      .from("brands")
      .select("organization_id")
      .eq("id", brandId)
      .single();

    if (!brand || brand.organization_id !== profile?.organization_id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Fetch scheduled analyses with related data
    const { data: schedules, error } = await supabase
      .from("scheduled_analyses")
      .select(`
        *,
        prompts (id, text),
        prompt_sets (id, name)
      `)
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ schedules: schedules || [] });
  } catch (error) {
    console.error("Failed to fetch schedules:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE - Delete a scheduled analysis
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { schedule_id } = body;

    if (!schedule_id) {
      return NextResponse.json({ error: "schedule_id is required" }, { status: 400 });
    }

    // Verify user has access to this schedule
    const { data: schedule } = await supabase
      .from("scheduled_analyses")
      .select(`
        brand_id,
        brands (organization_id)
      `)
      .eq("id", schedule_id)
      .single();

    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const brandOrg = (schedule.brands as { organization_id: string } | null)?.organization_id;
    if (brandOrg !== profile?.organization_id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Delete the schedule
    const { error } = await supabase
      .from("scheduled_analyses")
      .delete()
      .eq("id", schedule_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete schedule:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH - Toggle a scheduled analysis active/inactive
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { schedule_id, is_active } = body;

    if (!schedule_id || typeof is_active !== 'boolean') {
      return NextResponse.json({ error: "schedule_id and is_active are required" }, { status: 400 });
    }

    // Verify user has access to this schedule
    const { data: schedule } = await supabase
      .from("scheduled_analyses")
      .select(`
        brand_id,
        brands (organization_id)
      `)
      .eq("id", schedule_id)
      .single();

    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const brandOrg = (schedule.brands as { organization_id: string } | null)?.organization_id;
    if (brandOrg !== profile?.organization_id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Update the schedule
    const { data: updatedSchedule, error } = await supabase
      .from("scheduled_analyses")
      .update({ is_active })
      .eq("id", schedule_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ schedule: updatedSchedule });
  } catch (error) {
    console.error("Failed to update schedule:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

