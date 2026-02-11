import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BillingTier, TIER_LIMITS } from "@/types";
import { isTrialExpired } from "@/lib/subscription";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * POST /api/brands
 * Create a new brand with tier limit enforcement
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    const {
      name,
      domain,
      primary_location,
      languages = ["en"],
      brand_aliases = [],
      settings = {},
    } = body as {
      name: string;
      domain: string;
      primary_location?: string;
      languages?: string[];
      brand_aliases?: string[];
      settings?: Record<string, unknown>;
    };

    // Validate required fields
    if (!name?.trim() || !domain?.trim()) {
      return NextResponse.json(
        { error: "Name and domain are required" },
        { status: 400 }
      );
    }

    // Get user profile with organization
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(`
        *,
        organizations (*)
      `)
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.organizations) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    const organization = profile.organizations;
    const tier = organization.tier as BillingTier;
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;

    // Check if trial has expired
    if (isTrialExpired(organization)) {
      return NextResponse.json(
        { 
          error: "Trial expired", 
          message: "Your trial has expired. Please upgrade to continue.",
          code: "TRIAL_EXPIRED"
        },
        { status: 402 }
      );
    }

    // Get current brand count
    const { count: currentBrandCount } = await supabase
      .from("brands")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organization.id);

    // Check brand limit
    if ((currentBrandCount || 0) >= limits.max_brands) {
      return NextResponse.json(
        {
          error: "Brand limit reached",
          message: `Your ${tier} plan allows ${limits.max_brands} brand${limits.max_brands === 1 ? '' : 's'}. Upgrade to add more.`,
          code: "BRAND_LIMIT_REACHED",
          currentCount: currentBrandCount,
          maxAllowed: limits.max_brands,
        },
        { status: 402 }
      );
    }

    // Clean domain (remove protocol if present)
    const cleanDomain = domain
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");

    // Create the brand
    const { data: brand, error: createError } = await supabase
      .from("brands")
      .insert({
        organization_id: organization.id,
        name: name.trim(),
        domain: cleanDomain,
        primary_location: primary_location?.trim() || null,
        languages,
        brand_aliases,
        settings,
      })
      .select()
      .single();

    if (createError) {
      console.error("Brand creation error:", createError);
      return NextResponse.json(
        { error: createError.message },
        { status: 500 }
      );
    }

    // If auto-analysis is enabled, set up the new daily analyses system
    // This uses the simplified daily_analyses_enabled field and creates 3 daily slots
    try {
      const settingsObj = (settings || {}) as Record<string, unknown>;
      const autoEnabled = Boolean(settingsObj.auto_analysis_enabled);
      
      if (autoEnabled) {
        const now = new Date();
        
        // Calculate 3 daily slots at 8-hour intervals from now
        const slots = [
          { slot_number: 1, time: new Date(now) },
          { slot_number: 2, time: new Date(now.getTime() + 8 * 60 * 60 * 1000) },
          { slot_number: 3, time: new Date(now.getTime() + 16 * 60 * 60 * 1000) },
        ];
        
        // Update brand with daily analyses settings
        await supabaseAdmin
          .from("brands")
          .update({
            daily_analyses_enabled: true,
            daily_schedule_anchor_time: now.toISOString(),
            next_daily_run_at: slots[0].time.toISOString(),
            analysis_engines: settingsObj.analysis_engines || ["chatgpt", "perplexity", "gemini", "grok"],
            analysis_regions: settingsObj.analysis_regions || ["ae"],
          })
          .eq("id", brand.id);
        
        // Create daily analysis slots for today and tomorrow
        for (const slot of slots) {
          await supabaseAdmin
            .from("daily_analysis_slots")
            .insert({
              brand_id: brand.id,
              slot_number: slot.slot_number,
              scheduled_time: slot.time.toISOString(),
              status: "scheduled",
            })
            .select()
            .maybeSingle(); // Ignore duplicates
        }
        
        // Create tomorrow's slots too
        const tomorrowAnchor = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const tomorrowSlots = [
          { slot_number: 1, time: new Date(tomorrowAnchor) },
          { slot_number: 2, time: new Date(tomorrowAnchor.getTime() + 8 * 60 * 60 * 1000) },
          { slot_number: 3, time: new Date(tomorrowAnchor.getTime() + 16 * 60 * 60 * 1000) },
        ];
        
        for (const slot of tomorrowSlots) {
          await supabaseAdmin
            .from("daily_analysis_slots")
            .insert({
              brand_id: brand.id,
              slot_number: slot.slot_number,
              scheduled_time: slot.time.toISOString(),
              status: "scheduled",
            })
            .select()
            .maybeSingle();
        }
        
        console.log(`[Brand Create] Set up daily analyses for brand ${brand.id}`);
      }
    } catch (scheduleError) {
      console.error("Daily analyses setup error:", scheduleError);
      // Best-effort: don't fail brand creation if daily analyses setup fails
    }

    return NextResponse.json({
      success: true,
      brand,
      usage: {
        currentBrands: (currentBrandCount || 0) + 1,
        maxBrands: limits.max_brands,
        remaining: limits.max_brands - (currentBrandCount || 0) - 1,
      },
    });
  } catch (error) {
    console.error("Create brand error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/brands
 * List all brands for the user's organization
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    // Get all brands for the organization
    const { data: brands, error } = await supabase
      .from("brands")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ brands });
  } catch (error) {
    console.error("List brands error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

