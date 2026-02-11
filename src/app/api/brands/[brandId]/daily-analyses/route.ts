/**
 * API: /api/brands/[brandId]/daily-analyses
 * 
 * Simplified daily analyses toggle endpoint.
 * Users only see ON/OFF - all the complexity is handled server-side.
 * 
 * Features:
 * - Toggle daily analyses on/off
 * - When enabled: creates 3 daily slots at 8-hour intervals from NOW
 * - When disabled: cancels all pending slots and jobs
 * - Get current status and next run time
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ brandId: string }> };

/**
 * GET /api/brands/[brandId]/daily-analyses
 * Get the current daily analyses status for a brand
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
      .select("id, organization_id, daily_analyses_enabled, daily_schedule_anchor_time, next_daily_run_at, analysis_engines, analysis_regions")
      .eq("id", brandId)
      .single();

    if (!brand || brand.organization_id !== profile?.organization_id) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    // Get upcoming slots if enabled
    let upcomingSlots: { slot_number: number; scheduled_time: string }[] = [];
    if (brand.daily_analyses_enabled) {
      const { data: slots } = await supabase
        .from("daily_analysis_slots")
        .select("slot_number, scheduled_time")
        .eq("brand_id", brandId)
        .eq("status", "scheduled")
        .order("scheduled_time", { ascending: true })
        .limit(6); // Next 2 days worth

      upcomingSlots = slots || [];
    }

    // Get recent activity
    const { data: recentBatches } = await supabase
      .from("analysis_batches")
      .select("id, status, total_simulations, completed_simulations, created_at")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .limit(5);

    return NextResponse.json({
      enabled: brand.daily_analyses_enabled || false,
      anchor_time: brand.daily_schedule_anchor_time,
      next_run_at: brand.next_daily_run_at,
      engines: brand.analysis_engines || ['chatgpt', 'perplexity', 'gemini', 'grok'],
      regions: brand.analysis_regions || ['ae'],
      upcoming_slots: upcomingSlots,
      recent_batches: recentBatches || [],
    });

  } catch (error) {
    console.error("Error getting daily analyses status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/brands/[brandId]/daily-analyses
 * Toggle daily analyses on/off
 * 
 * Body: { enabled: boolean }
 */
export async function POST(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const { brandId } = await context.params;
    const supabase = await createClient();
    const body = await request.json();
    const { enabled } = body;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: "Invalid request: 'enabled' must be a boolean" },
        { status: 400 }
      );
    }

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
      .select("id, organization_id, daily_analyses_enabled, daily_schedule_anchor_time")
      .eq("id", brandId)
      .single();

    if (!brand || brand.organization_id !== profile?.organization_id) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const now = new Date();

    if (enabled) {
      // ENABLE daily analyses
      console.log(`[Daily Analyses] Enabling for brand ${brandId}`);

      // Set anchor time to NOW - slots will be at NOW, NOW+8h, NOW+16h
      const anchorTime = now;

      // Calculate the 3 daily slots
      const slots = [
        { slot_number: 1, time: new Date(anchorTime) },
        { slot_number: 2, time: new Date(anchorTime.getTime() + 8 * 60 * 60 * 1000) },
        { slot_number: 3, time: new Date(anchorTime.getTime() + 16 * 60 * 60 * 1000) },
      ];

      // Update brand settings
      await supabase
        .from("brands")
        .update({
          daily_analyses_enabled: true,
          daily_schedule_anchor_time: anchorTime.toISOString(),
          next_daily_run_at: slots[0].time.toISOString(),
        })
        .eq("id", brandId);

      // Create slots for today (skip first if it's NOW, as we'll run it immediately)
      // Actually, we schedule all 3 and let the processor handle them
      for (const slot of slots) {
        // Check if slot already exists for this time
        const existingCheck = await supabase
          .from("daily_analysis_slots")
          .select("id")
          .eq("brand_id", brandId)
          .eq("slot_number", slot.slot_number)
          .gte("scheduled_time", now.toISOString().split('T')[0])
          .lt("scheduled_time", new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0])
          .maybeSingle();

        if (!existingCheck?.data) {
          await supabase
            .from("daily_analysis_slots")
            .insert({
              brand_id: brandId,
              slot_number: slot.slot_number,
              scheduled_time: slot.time.toISOString(),
              status: "scheduled",
            });
        }
      }

      // Also create tomorrow's slots
      const tomorrowAnchor = new Date(anchorTime.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowSlots = [
        { slot_number: 1, time: new Date(tomorrowAnchor) },
        { slot_number: 2, time: new Date(tomorrowAnchor.getTime() + 8 * 60 * 60 * 1000) },
        { slot_number: 3, time: new Date(tomorrowAnchor.getTime() + 16 * 60 * 60 * 1000) },
      ];

      for (const slot of tomorrowSlots) {
        await supabase
          .from("daily_analysis_slots")
          .insert({
            brand_id: brandId,
            slot_number: slot.slot_number,
            scheduled_time: slot.time.toISOString(),
            status: "scheduled",
          })
          .select()
          .maybeSingle(); // Ignore duplicates
      }

      console.log(`[Daily Analyses] Created ${slots.length + tomorrowSlots.length} slots for brand ${brandId}`);

      return NextResponse.json({
        success: true,
        enabled: true,
        anchor_time: anchorTime.toISOString(),
        next_run_at: slots[0].time.toISOString(),
        message: "Daily analyses enabled. Running 3 times per day at 8-hour intervals.",
      });

    } else {
      // DISABLE daily analyses
      console.log(`[Daily Analyses] Disabling for brand ${brandId}`);

      // Update brand settings
      await supabase
        .from("brands")
        .update({
          daily_analyses_enabled: false,
          next_daily_run_at: null,
        })
        .eq("id", brandId);

      // Cancel all pending slots
      await supabase
        .from("daily_analysis_slots")
        .update({ status: "skipped" })
        .eq("brand_id", brandId)
        .eq("status", "scheduled");

      // Cancel all pending RPA jobs for this brand
      await supabase
        .from("rpa_job_queue")
        .update({ status: "cancelled" })
        .eq("brand_id", brandId)
        .in("status", ["pending", "scheduled"]);

      console.log(`[Daily Analyses] Disabled for brand ${brandId}`);

      return NextResponse.json({
        success: true,
        enabled: false,
        message: "Daily analyses disabled.",
      });
    }

  } catch (error) {
    console.error("Error toggling daily analyses:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/brands/[brandId]/daily-analyses
 * Update daily analyses configuration (engines, regions)
 * 
 * Body: { engines?: string[], regions?: string[] }
 */
export async function PATCH(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const { brandId } = await context.params;
    const supabase = await createClient();
    const body = await request.json();
    const { engines, regions } = body;

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

    // Validate engines
    const validEngines = ['chatgpt', 'perplexity', 'gemini', 'grok'];
    if (engines && (!Array.isArray(engines) || !engines.every(e => validEngines.includes(e)))) {
      return NextResponse.json(
        { error: "Invalid engines. Must be array of: chatgpt, perplexity, gemini, grok" },
        { status: 400 }
      );
    }

    // Build update object
    const updates: Record<string, unknown> = {};
    if (engines) updates.analysis_engines = engines;
    if (regions) updates.analysis_regions = regions;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    // Update brand
    await supabase
      .from("brands")
      .update(updates)
      .eq("id", brandId);

    return NextResponse.json({
      success: true,
      updated: Object.keys(updates),
    });

  } catch (error) {
    console.error("Error updating daily analyses config:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

