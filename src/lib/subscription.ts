import { BillingTier, TIER_LIMITS, Organization } from "@/types";

// ===========================================
// Subscription Status Types
// ===========================================

export interface SubscriptionStatus {
  tier: BillingTier;
  creditsBalance: number;
  creditsUsedThisPeriod: number;
  monthlyCredits: number;
  
  // Trial info
  isTrialActive: boolean;
  trialDaysRemaining: number;
  trialExpiresAt: Date | null;
  trialConverted: boolean;
  
  // Paid subscription info
  isPaidSubscription: boolean;
  subscriptionStatus: string | null;
  subscriptionPeriodEnd: Date | null;
  
  // Limits
  limits: typeof TIER_LIMITS[BillingTier];
  
  // Usage
  currentBrandCount: number;
  maxBrands: number;
  canCreateBrand: boolean;
  
  // Features
  hasHallucinationWatchdog: boolean;
  hasWebsiteCrawling: boolean;
}

export interface TierLimitCheck {
  allowed: boolean;
  currentCount: number;
  maxAllowed: number;
  message: string;
}

// ===========================================
// Subscription Utilities
// ===========================================

/**
 * Get the limits for a specific tier
 */
export function getTierLimits(tier: BillingTier) {
  return TIER_LIMITS[tier] || TIER_LIMITS.free;
}

/**
 * Check if a trial has expired
 */
export function isTrialExpired(organization: Pick<Organization, 'tier' | 'trial_expires_at'>): boolean {
  if (organization.tier !== 'trial') return false;
  
  const trialExpiresAt = organization.trial_expires_at 
    ? new Date(organization.trial_expires_at) 
    : null;
  
  if (!trialExpiresAt) return false;
  
  return trialExpiresAt < new Date();
}

/**
 * Get remaining trial days
 */
export function getTrialDaysRemaining(organization: Pick<Organization, 'trial_expires_at'>): number {
  const trialExpiresAt = organization.trial_expires_at 
    ? new Date(organization.trial_expires_at) 
    : null;
  
  if (!trialExpiresAt) return 0;
  
  const now = new Date();
  const diffMs = trialExpiresAt.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
}

/**
 * Check if user can create a new brand based on tier limits
 */
export function canCreateBrand(organization: Organization, currentBrandCount: number): TierLimitCheck {
  const limits = getTierLimits(organization.tier as BillingTier);
  
  // Check for expired trial
  if (isTrialExpired(organization)) {
    return {
      allowed: false,
      currentCount: currentBrandCount,
      maxAllowed: limits.max_brands,
      message: "Your trial has expired. Please upgrade to continue."
    };
  }
  
  // Check brand limit
  if (currentBrandCount >= limits.max_brands) {
    return {
      allowed: false,
      currentCount: currentBrandCount,
      maxAllowed: limits.max_brands,
      message: `Brand limit reached. Your ${organization.tier} plan allows ${limits.max_brands} brand${limits.max_brands === 1 ? '' : 's'}. Upgrade to add more.`
    };
  }
  
  return {
    allowed: true,
    currentCount: currentBrandCount,
    maxAllowed: limits.max_brands,
    message: "OK"
  };
}

/**
 * Check if user can add more prompts to a brand
 */
export function canAddPrompts(
  organization: Organization, 
  currentPromptCount: number, 
  addCount: number = 1
): TierLimitCheck {
  const limits = getTierLimits(organization.tier as BillingTier);
  const newTotal = currentPromptCount + addCount;
  
  // Check for expired trial
  if (isTrialExpired(organization)) {
    return {
      allowed: false,
      currentCount: currentPromptCount,
      maxAllowed: limits.max_prompts_per_brand,
      message: "Your trial has expired. Please upgrade to continue."
    };
  }
  
  // Check prompt limit
  if (newTotal > limits.max_prompts_per_brand) {
    return {
      allowed: false,
      currentCount: currentPromptCount,
      maxAllowed: limits.max_prompts_per_brand,
      message: `Prompt limit reached. Your ${organization.tier} plan allows ${limits.max_prompts_per_brand} prompts per brand. Upgrade to add more.`
    };
  }
  
  return {
    allowed: true,
    currentCount: currentPromptCount,
    maxAllowed: limits.max_prompts_per_brand,
    message: "OK"
  };
}

/**
 * Check if user has enough credits for an operation
 */
export function hasCredits(organization: Organization, required: number = 1): TierLimitCheck {
  // Check for expired trial
  if (isTrialExpired(organization)) {
    return {
      allowed: false,
      currentCount: organization.credits_balance,
      maxAllowed: 0,
      message: "Your trial has expired. Please upgrade to continue."
    };
  }
  
  if (organization.credits_balance < required) {
    return {
      allowed: false,
      currentCount: organization.credits_balance,
      maxAllowed: required,
      message: `Insufficient credits. Need ${required} but have ${organization.credits_balance}. Please upgrade to get more credits.`
    };
  }
  
  return {
    allowed: true,
    currentCount: organization.credits_balance,
    maxAllowed: required,
    message: "OK"
  };
}

/**
 * Check if a feature is available for the tier
 */
export function hasFeature(
  organization: Organization, 
  feature: 'hallucination_watchdog' | 'website_crawling'
): boolean {
  // Expired trial loses features
  if (isTrialExpired(organization)) {
    return false;
  }
  
  const limits = getTierLimits(organization.tier as BillingTier);
  return limits[feature] || false;
}

/**
 * Get upgrade message based on current tier and desired action
 */
export function getUpgradeMessage(
  currentTier: BillingTier, 
  blockedAction: 'brands' | 'prompts' | 'credits' | 'feature'
): { title: string; description: string; suggestedTier: BillingTier } {
  const messages: Record<string, { title: string; description: string; suggestedTier: BillingTier }> = {
    'free-brands': {
      title: "Upgrade to Track More Brands",
      description: "The free plan only allows 1 brand. Upgrade to Starter for 3 brands or Pro for 10 brands.",
      suggestedTier: 'starter'
    },
    'free-prompts': {
      title: "Upgrade for More Prompts",
      description: "The free plan allows 10 prompts per brand. Upgrade to unlock up to 500 prompts per brand.",
      suggestedTier: 'starter'
    },
    'free-credits': {
      title: "Out of Credits",
      description: "You've used all your free credits. Upgrade to continue running analyses.",
      suggestedTier: 'starter'
    },
    'trial-brands': {
      title: "Upgrade to Track More Brands",
      description: "Your trial allows 2 brands. Upgrade to Starter for 3 brands or Pro for 10 brands.",
      suggestedTier: 'starter'
    },
    'trial-prompts': {
      title: "Upgrade for More Prompts",
      description: "Your trial allows 25 prompts per brand. Upgrade to unlock up to 500 prompts per brand.",
      suggestedTier: 'starter'
    },
    'trial-credits': {
      title: "Running Low on Trial Credits",
      description: "Upgrade now to get more credits and unlock full platform features.",
      suggestedTier: 'starter'
    },
    'starter-brands': {
      title: "Upgrade to Pro for More Brands",
      description: "The Starter plan allows 3 brands. Upgrade to Pro for 10 brands or Agency for 50.",
      suggestedTier: 'pro'
    },
    'starter-prompts': {
      title: "Upgrade for More Prompts",
      description: "The Starter plan allows 50 prompts per brand. Upgrade to Pro for 200 or Agency for 500.",
      suggestedTier: 'pro'
    },
    'starter-credits': {
      title: "Out of Monthly Credits",
      description: "Upgrade to Pro for 10,000 monthly credits or wait for your next billing cycle.",
      suggestedTier: 'pro'
    },
    'starter-feature': {
      title: "Upgrade for Advanced Features",
      description: "Hallucination Watchdog is available on Pro and Agency plans.",
      suggestedTier: 'pro'
    },
    'pro-brands': {
      title: "Upgrade to Agency",
      description: "The Pro plan allows 10 brands. Upgrade to Agency for up to 50 brands.",
      suggestedTier: 'agency'
    },
    'pro-prompts': {
      title: "Upgrade to Agency",
      description: "The Pro plan allows 200 prompts per brand. Upgrade to Agency for 500.",
      suggestedTier: 'agency'
    },
    'pro-credits': {
      title: "Out of Monthly Credits",
      description: "Upgrade to Agency for 50,000 monthly credits or wait for your next billing cycle.",
      suggestedTier: 'agency'
    }
  };
  
  const key = `${currentTier}-${blockedAction}`;
  return messages[key] || {
    title: "Upgrade Your Plan",
    description: "Unlock more features and higher limits with an upgraded plan.",
    suggestedTier: currentTier === 'free' || currentTier === 'trial' ? 'starter' : 'pro'
  };
}

/**
 * Format tier name for display
 */
export function formatTierName(tier: BillingTier): string {
  const names: Record<BillingTier, string> = {
    free: 'Free',
    trial: 'Trial',
    starter: 'Starter',
    pro: 'Pro',
    agency: 'Agency'
  };
  return names[tier] || 'Unknown';
}

/**
 * Get tier badge color classes
 */
export function getTierBadgeClasses(tier: BillingTier): string {
  const classes: Record<BillingTier, string> = {
    free: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    trial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    starter: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    pro: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    agency: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
  };
  return classes[tier] || classes.free;
}

/**
 * Calculate credits needed for an analysis
 */
export function calculateCreditsNeeded(
  promptCount: number, 
  engineCount: number, 
  mode: 'api' | 'browser' | 'hybrid' = 'api'
): number {
  const baseCredits = promptCount * engineCount;
  
  switch (mode) {
    case 'browser':
      return baseCredits * 2; // Browser mode costs 2x
    case 'hybrid':
      return baseCredits * 3; // Hybrid mode costs 3x
    default:
      return baseCredits;
  }
}

