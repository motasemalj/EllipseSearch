"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, ArrowRight, Settings } from "lucide-react";
import { toast } from "sonner";

interface BillingActionsProps {
  currentTier: string;
  hasSubscription: boolean;
  targetTier?: string;
  buttonOnly?: boolean;
}

export function BillingActions({ 
  currentTier, 
  hasSubscription,
  targetTier,
  buttonOnly = false 
}: BillingActionsProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleCheckout = async (tier: string) => {
    setIsLoading(tier);
    try {
      const response = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Failed to start checkout", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsLoading(null);
    }
  };

  const handlePortal = async () => {
    setIsLoading("portal");
    try {
      const response = await fetch("/api/billing/create-portal-session", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to open billing portal");
      }

      // Redirect to Stripe Portal
      window.location.href = data.url;
    } catch (error) {
      console.error("Portal error:", error);
      toast.error("Failed to open billing portal", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsLoading(null);
    }
  };

  // If buttonOnly is true and targetTier is provided, render just the upgrade button
  if (buttonOnly && targetTier) {
    const isUpgrade = getTierRank(targetTier) > getTierRank(currentTier);
    const isDowngrade = getTierRank(targetTier) < getTierRank(currentTier);

    return (
      <Button 
        className="w-full gap-2"
        variant={isUpgrade ? "default" : "outline"}
        onClick={() => handleCheckout(targetTier)}
        disabled={isLoading === targetTier}
      >
        {isLoading === targetTier ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            {isUpgrade ? "Upgrade" : isDowngrade ? "Downgrade" : "Switch"}
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </Button>
    );
  }

  // Full billing actions section
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-semibold mb-4">Billing Actions</h2>
      <div className="flex flex-wrap gap-3">
        {hasSubscription ? (
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={handlePortal}
            disabled={isLoading === "portal"}
          >
            {isLoading === "portal" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Opening...
              </>
            ) : (
              <>
                <Settings className="w-4 h-4" />
                Manage Subscription
              </>
            )}
          </Button>
        ) : (
          <>
            <Button 
              className="gap-2"
              onClick={() => handleCheckout("starter")}
              disabled={!!isLoading}
            >
              {isLoading === "starter" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CreditCard className="w-4 h-4" />
              )}
              Subscribe to Starter
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function getTierRank(tier: string): number {
  const ranks: Record<string, number> = {
    free: 0,
    trial: 0,
    starter: 1,
    pro: 2,
    agency: 3,
  };
  return ranks[tier] ?? 0;
}
