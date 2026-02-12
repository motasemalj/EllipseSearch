import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BillingTier, TIER_LIMITS } from "@/types";
import { 
  isTrialExpired, 
  getTrialDaysRemaining, 
  getTierLimits 
} from "@/lib/subscription";

export async function GET() {
  try {
    const supabase = await createClient();

    // Get current user and their organization
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get profile with organization
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
    const limits = getTierLimits(tier);

    // Get current brand count
    const { count: brandCount } = await supabase
      .from("brands")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organization.id);

    // Calculate trial info
    const trialExpired = isTrialExpired(organization);
    const trialDaysRemaining = getTrialDaysRemaining(organization);

    // Build comprehensive status response
    const status = {
      // Organization info
      organizationId: organization.id,
      organizationName: organization.name,
      
      // Current tier
      tier: tier,
      tierDisplayName: formatTierName(tier),
      
      // Trial status
      isTrialActive: tier === 'trial' && !trialExpired,
      isTrialExpired: trialExpired,
      trialDaysRemaining: trialDaysRemaining,
      trialStartedAt: organization.trial_started_at,
      trialExpiresAt: organization.trial_expires_at,
      trialConverted: organization.trial_converted || false,
      
      // Paid subscription status
      isPaidSubscription: ['starter', 'pro', 'agency'].includes(tier) && 
        organization.stripe_subscription_status === 'active',
      subscriptionStatus: organization.stripe_subscription_status,
      subscriptionPeriodEnd: organization.subscription_period_end,
      
      // Current limits
      limits: {
        maxBrands: limits.max_brands,
        maxPromptsPerBrand: limits.max_prompts_per_brand,
        maxConcurrentJobs: limits.max_concurrent_jobs,
        hasHallucinationWatchdog: limits.hallucination_watchdog,
        hasWebsiteCrawling: limits.website_crawling,
      },
      
      // Usage
      usage: {
        currentBrands: brandCount || 0,
        brandsRemaining: Math.max(0, limits.max_brands - (brandCount || 0)),
      },
      
      // Quick access booleans
      canCreateBrand: (brandCount || 0) < limits.max_brands && !trialExpired,
      needsUpgrade: tier === 'free' || trialExpired,
      showTrialBanner: tier === 'trial' && !trialExpired && trialDaysRemaining <= 2,
      
      // All tier limits for comparison
      allTierLimits: TIER_LIMITS,
    };

    return NextResponse.json(status);
  } catch (error) {
    console.error("Subscription status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function formatTierName(tier: BillingTier): string {
  const names: Record<BillingTier, string> = {
    free: 'Free',
    trial: 'Trial',
    starter: 'Starter',
    pro: 'Pro',
    agency: 'Agency'
  };
  return names[tier] || 'Unknown';
}

