"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Clock, Crown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SubscriptionStatus {
  tier: string;
  tierDisplayName: string;
  isTrialActive: boolean;
  isTrialExpired: boolean;
  trialDaysRemaining: number;
  isPaidSubscription: boolean;
  showTrialBanner: boolean;
  needsUpgrade: boolean;
}

export function SubscriptionBanner() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/subscription/status");
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch (error) {
        console.error("Failed to fetch subscription status:", error);
      }
    }
    fetchStatus();
  }, []);

  if (!status || dismissed) return null;

  if (status.isPaidSubscription) return null;

  // Trial expired - always show
  if (status.isTrialExpired) {
    return (
      <div className="bg-gradient-to-r from-red-600 to-rose-600 text-white px-4 py-3">
        <div className="container mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">
              Your trial has expired. Upgrade now to continue tracking your brand&apos;s AI visibility.
            </p>
          </div>
          <Link href="/billing">
            <Button size="sm" variant="secondary" className="gap-1.5 bg-white text-red-600 hover:bg-red-50">
              <Crown className="w-4 h-4" />
              Upgrade Now
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Trial active with less than 2 days remaining
  if (status.isTrialActive && status.trialDaysRemaining <= 2) {
    return (
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-3">
        <div className="container mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 flex-shrink-0 animate-pulse" />
            <p className="text-sm font-medium">
              {status.trialDaysRemaining === 0 
                ? "Your trial ends today!" 
                : status.trialDaysRemaining === 1
                  ? "Only 1 day left in your trial!"
                  : `${status.trialDaysRemaining} days left in your trial.`}
              {" "}Upgrade to keep your data and unlock full features.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/billing">
              <Button size="sm" variant="secondary" className="gap-1.5 bg-white text-amber-600 hover:bg-amber-50">
                <Crown className="w-4 h-4" />
                Upgrade
              </Button>
            </Link>
            <Button 
              size="sm" 
              variant="ghost" 
              className="text-white hover:bg-white/10"
              onClick={() => setDismissed(true)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Compact badge version for sidebar/header
export function SubscriptionBadge({ className }: { className?: string }) {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/subscription/status");
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch (error) {
        console.error("Failed to fetch subscription status:", error);
      }
    }
    fetchStatus();
  }, []);

  if (!status) return null;

  const tierColors: Record<string, string> = {
    free: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    trial: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    starter: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    pro: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    agency: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  };

  return (
    <Link href="/billing">
      <div className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all hover:scale-105",
        tierColors[status.tier] || tierColors.free,
        className
      )}>
        {status.tier === 'trial' && <Clock className="w-3 h-3" />}
        {['starter', 'pro', 'agency'].includes(status.tier) && <Crown className="w-3 h-3" />}
        <span className="capitalize">{status.tierDisplayName}</span>
        {status.isTrialActive && status.trialDaysRemaining <= 2 && (
          <span className="text-[10px] opacity-75">
            ({status.trialDaysRemaining}d left)
          </span>
        )}
      </div>
    </Link>
  );
}

