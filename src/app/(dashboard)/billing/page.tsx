import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle2, 
  Zap, 
  Crown,
  Building2,
  ArrowRight,
  BarChart3,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { BillingActions } from "@/components/billing/billing-actions";
import { BillingTier, TIER_LIMITS } from "@/types";
import { DirhamSymbol } from "@/components/ui/dirham-symbol";
import { formatCurrencyAmount, getCurrencyFromHeaders, getPricingTiers } from "@/lib/pricing";
import { isTrialExpired, getTrialDaysRemaining } from "@/lib/subscription";

const plans = [
  {
    id: "starter",
    name: "Starter",
    period: "/month",
    description: "Perfect for getting started",
    features: [
      `Up to ${TIER_LIMITS.starter.max_brands} brands`,
      `${TIER_LIMITS.starter.max_prompts_per_brand} prompts per brand`,
      "All AI engines",
      "Daily analysis",
      "Basic analytics",
    ],
    icon: <Zap className="w-5 h-5" />,
    popular: false,
  },
  {
    id: "pro",
    name: "Pro",
    period: "/month",
    description: "For growing agencies",
    features: [
      `Up to ${TIER_LIMITS.pro.max_brands} brands`,
      `${TIER_LIMITS.pro.max_prompts_per_brand} prompts per brand`,
      "All AI engines",
      "Daily analysis",
      "Advanced analytics",
      "Hallucination detection",
      "Priority support",
    ],
    icon: <Crown className="w-5 h-5" />,
    popular: true,
  },
  {
    id: "agency",
    name: "Agency",
    period: "",
    description: "For large agencies",
    features: [
      `Up to ${TIER_LIMITS.agency.max_brands} brands`,
      `${TIER_LIMITS.agency.max_prompts_per_brand} prompts per brand`,
      "All AI engines",
      "Daily analysis",
      "White-label reports",
      "API access",
      "Dedicated support",
    ],
    icon: <Building2 className="w-5 h-5" />,
    popular: false,
  },
];

export default async function BillingPage() {
  const currency = getCurrencyFromHeaders(await headers());
  const pricingTiers = getPricingTiers(currency);
  const plansWithPricing = plans.map((plan) => {
    const pricing = pricingTiers.find((tier) => tier.id === plan.id);
    return {
      ...plan,
      price: pricing?.price ?? null,
      currency: pricing?.currency ?? "USD",
      isCustom: pricing?.isCustom ?? false,
    };
  });

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, organizations(*)")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) redirect("/login");

  const organization = profile.organizations as {
    tier: string;
    stripe_subscription_status: string | null;
    stripe_customer_id: string | null;
    trial_started_at: string | null;
    trial_expires_at: string | null;
    trial_converted: boolean;
  };

  const currentTier = organization?.tier || "free";
  const subscriptionStatus = organization?.stripe_subscription_status;
  const tierLimits = TIER_LIMITS[currentTier as keyof typeof TIER_LIMITS] || TIER_LIMITS.free;
  
  // Trial status
  const trialExpired = isTrialExpired({ tier: currentTier as BillingTier, trial_expires_at: organization.trial_expires_at });
  const trialDaysRemaining = getTrialDaysRemaining({ trial_expires_at: organization.trial_expires_at });
  const isOnTrial = currentTier === 'trial' && !trialExpired;

  // Get usage stats
  const { count: brandsCount } = await supabase
    .from("brands")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", profile.organization_id);

  const { count: simulationsCount } = await supabase
    .from("simulations")
    .select("*", { count: "exact", head: true })
    .gte("created_at", new Date(new Date().setDate(1)).toISOString()); // This month

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription and billing
        </p>
      </div>

      {/* Trial Warning Banner */}
      {isOnTrial && trialDaysRemaining <= 2 && (
        <div className="rounded-2xl border-2 border-amber-500/50 bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-amber-500/20">
              <Clock className="w-6 h-6 text-amber-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">
                {trialDaysRemaining === 0 
                  ? "Your trial ends today!" 
                  : trialDaysRemaining === 1
                    ? "Only 1 day left in your trial"
                    : `${trialDaysRemaining} days left in your trial`}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Upgrade now to keep your data and unlock full features. No interruption to your service.
              </p>
            </div>
            <BillingActions 
              currentTier={currentTier} 
              targetTier="starter"
              hasSubscription={!!organization?.stripe_customer_id}
              buttonOnly
            />
          </div>
        </div>
      )}

      {/* Trial Expired Banner */}
      {trialExpired && (
        <div className="rounded-2xl border-2 border-red-500/50 bg-gradient-to-r from-red-500/10 to-rose-500/10 p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-red-500/20">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg text-red-600 dark:text-red-400">Trial Expired</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your trial has ended. Upgrade now to continue tracking your brand&apos;s AI visibility.
              </p>
            </div>
            <BillingActions 
              currentTier={currentTier} 
              targetTier="starter"
              hasSubscription={!!organization?.stripe_customer_id}
              buttonOnly
            />
          </div>
        </div>
      )}

      {/* Current Plan Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Current Plan */}
        <div className={`rounded-2xl border p-6 ${
          trialExpired 
            ? 'border-red-500/30 bg-gradient-to-br from-red-500/10 to-transparent'
            : isOnTrial 
              ? 'border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent'
              : 'border-primary/30 bg-gradient-to-br from-primary/10 to-transparent'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {isOnTrial ? (
              <Clock className="w-5 h-5 text-amber-500" />
            ) : trialExpired ? (
              <AlertTriangle className="w-5 h-5 text-red-500" />
            ) : (
              <Zap className="w-5 h-5 text-primary" />
            )}
            <span className="text-sm text-muted-foreground">Current Plan</span>
          </div>
          <p className="text-2xl font-bold capitalize">{currentTier}</p>
          {isOnTrial && (
            <span className="inline-block mt-2 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
              {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''} remaining
            </span>
          )}
          {trialExpired && (
            <span className="inline-block mt-2 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400">
              Expired
            </span>
          )}
          {subscriptionStatus && !isOnTrial && !trialExpired && (
            <span className={`inline-block mt-2 px-2.5 py-1 rounded-full text-xs font-medium ${
              subscriptionStatus === 'active' 
                ? 'bg-green-500/10 text-green-500' 
                : 'bg-yellow-500/10 text-yellow-500'
            }`}>
              {subscriptionStatus}
            </span>
          )}
        </div>

        {/* Usage */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-5 h-5 text-primary" />
            <span className="text-sm text-muted-foreground">Usage</span>
          </div>
          <p className="text-2xl font-bold">{brandsCount || 0} <span className="text-sm font-normal text-muted-foreground">/ {tierLimits.max_brands === Infinity ? "∞" : tierLimits.max_brands}</span></p>
          <p className="text-xs text-muted-foreground mt-1">
            brands
          </p>
          <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
            <div 
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${tierLimits.max_brands === Infinity ? 0 : Math.min(100, ((brandsCount || 0) / tierLimits.max_brands) * 100)}%` }}
            />
          </div>
        </div>

        {/* Usage */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">This Month</span>
          </div>
          <p className="text-2xl font-bold">{simulationsCount?.toLocaleString() || 0}</p>
          <p className="text-xs text-muted-foreground mt-1">
            simulations run
          </p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold mb-4">Usage Summary</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Brands</p>
            <p className="text-xl font-bold">{brandsCount || 0} <span className="text-sm font-normal text-muted-foreground">/ {tierLimits.max_brands === Infinity ? "∞" : tierLimits.max_brands}</span></p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Prompts/Brand</p>
            <p className="text-xl font-bold">— <span className="text-sm font-normal text-muted-foreground">/ {tierLimits.max_prompts_per_brand === Infinity ? "∞" : tierLimits.max_prompts_per_brand}</span></p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Simulations</p>
            <p className="text-xl font-bold">{simulationsCount?.toLocaleString() || 0}</p>
          </div>
        </div>
      </div>

      {/* Billing Actions */}
      <BillingActions 
        currentTier={currentTier} 
        hasSubscription={!!organization?.stripe_customer_id}
      />

      {/* Plans */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plansWithPricing.map((plan) => {
            const isCurrent = plan.id === currentTier;
            return (
              <div 
                key={plan.id}
                className={`relative rounded-2xl border p-6 transition-all hover:shadow-lg ${
                  plan.popular 
                    ? "border-primary bg-gradient-to-br from-primary/5 to-transparent" 
                    : "border-border bg-card"
                } ${isCurrent ? "ring-2 ring-primary" : ""}`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                    Most Popular
                  </span>
                )}
                
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-2 rounded-lg ${plan.popular ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {plan.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold">{plan.name}</h3>
                    <p className="text-xs text-muted-foreground">{plan.description}</p>
                  </div>
                </div>

                <div className="mb-6">
                  {plan.isCustom ? (
                    <span className="text-3xl font-bold">Custom</span>
                  ) : (
                    <>
                      <span className="text-3xl font-bold inline-flex items-center gap-1">
                        {plan.currency === "AED" ? (
                          <DirhamSymbol size="lg" />
                        ) : (
                          <span>{plan.currency === "SAR" ? "SAR" : "$"}</span>
                        )}
                        {formatCurrencyAmount(plan.price ?? 0)}
                      </span>
                      <span className="text-muted-foreground">{plan.period}</span>
                    </>
                  )}
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    Current Plan
                  </Button>
                ) : plan.isCustom ? (
                  <Button variant="outline" className="w-full gap-2" asChild>
                    <a href="/support">
                      Contact Sales
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </Button>
                ) : (
                  <BillingActions 
                    currentTier={currentTier} 
                    targetTier={plan.id}
                    hasSubscription={!!organization?.stripe_customer_id}
                    buttonOnly
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* FAQ or Contact */}
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <h3 className="font-semibold mb-2">Need a custom plan?</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Contact our sales team for enterprise pricing and custom solutions.
        </p>
        <Button variant="outline" className="gap-2">
          Contact Sales
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
