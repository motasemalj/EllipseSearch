"use client";

/**
 * DailyAnalysesToggle Component
 * 
 * A simplified toggle that shows only ON/OFF for daily analyses.
 * Users don't see details about frequency, number of runs, or timing.
 * All complexity is handled server-side.
 * 
 * Features:
 * - Simple toggle switch
 * - Loading state
 * - Status indicator
 * - Minimalist design
 */

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Clock, Loader2, CheckCircle } from "lucide-react";

interface DailyAnalysesToggleProps {
  brandId: string;
  className?: string;
  compact?: boolean;  // Compact mode for inline display
  onStatusChange?: (enabled: boolean) => void;
}

interface DailyAnalysesStatus {
  enabled: boolean;
  next_run_at: string | null;
  upcoming_slots: { slot_number: number; scheduled_time: string }[];
}

export function DailyAnalysesToggle({
  brandId,
  className,
  compact = false,
  onStatusChange,
}: DailyAnalysesToggleProps) {
  const [status, setStatus] = useState<DailyAnalysesStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);

  // Fetch current status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/brands/${brandId}/daily-analyses`);
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error("Failed to fetch daily analyses status:", error);
    } finally {
      setIsLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Toggle handler
  const handleToggle = async () => {
    if (isToggling || !status) return;

    setIsToggling(true);
    const newEnabled = !status.enabled;

    try {
      const response = await fetch(`/api/brands/${brandId}/daily-analyses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled }),
      });

      if (response.ok) {
        const data = await response.json();
        setStatus(prev => prev ? { ...prev, enabled: data.enabled, next_run_at: data.next_run_at } : null);
        
        if (newEnabled) {
          setJustEnabled(true);
          setTimeout(() => setJustEnabled(false), 3000);
        }
        
        onStatusChange?.(newEnabled);
      }
    } catch (error) {
      console.error("Failed to toggle daily analyses:", error);
    } finally {
      setIsToggling(false);
    }
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  // Compact mode - just the toggle
  if (compact) {
    return (
      <button
        onClick={handleToggle}
        disabled={isToggling}
        className={cn(
          "relative w-12 h-6 rounded-full transition-all duration-300",
          status.enabled 
            ? "bg-success shadow-[0_0_8px_rgba(34,197,94,0.4)]" 
            : "bg-muted hover:bg-muted/80",
          isToggling && "opacity-60",
          className
        )}
      >
        <div
          className={cn(
            "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300",
            status.enabled ? "translate-x-6" : "translate-x-0.5"
          )}
        >
          {isToggling && (
            <Loader2 className="w-3 h-3 absolute top-1 left-1 animate-spin text-muted-foreground" />
          )}
        </div>
      </button>
    );
  }

  // Full mode - toggle with description
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg transition-colors",
            status.enabled ? "bg-success/10" : "bg-muted"
          )}>
            <Clock className={cn(
              "w-5 h-5 transition-colors",
              status.enabled ? "text-success" : "text-muted-foreground"
            )} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Daily Analyses</span>
              {justEnabled && (
                <span className="flex items-center gap-1 text-xs text-success animate-in fade-in slide-in-from-left-2">
                  <CheckCircle className="w-3 h-3" />
                  Enabled
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {status.enabled 
                ? "Automatically monitoring your visibility"
                : "Enable to track visibility throughout the day"
              }
            </p>
          </div>
        </div>

        {/* Toggle Switch */}
        <button
          onClick={handleToggle}
          disabled={isToggling}
          className={cn(
            "relative w-14 h-7 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2",
            status.enabled 
              ? "bg-success focus:ring-success/30 shadow-[0_0_12px_rgba(34,197,94,0.3)]" 
              : "bg-muted focus:ring-muted/50 hover:bg-muted/80",
            isToggling && "opacity-60 cursor-wait"
          )}
          aria-label={status.enabled ? "Disable daily analyses" : "Enable daily analyses"}
        >
          <div
            className={cn(
              "absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 flex items-center justify-center",
              status.enabled ? "translate-x-8" : "translate-x-1"
            )}
          >
            {isToggling && (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            )}
          </div>
        </button>
      </div>

      {/* Status Badge */}
      {status.enabled && (
        <div className="flex items-center gap-2 pl-11">
          <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <span className="text-xs text-muted-foreground">Active</span>
        </div>
      )}
    </div>
  );
}

/**
 * Minimal card version of the toggle for dashboard use
 */
export function DailyAnalysesCard({
  brandId,
  className,
}: {
  brandId: string;
  className?: string;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await fetch(`/api/brands/${brandId}/daily-analyses`);
        if (response.ok) {
          const data = await response.json();
          setEnabled(data.enabled);
        }
      } catch {
        // Ignore errors
      } finally {
        setIsLoading(false);
      }
    }
    fetchStatus();
  }, [brandId]);

  const handleToggle = async () => {
    if (isToggling || enabled === null) return;
    setIsToggling(true);

    try {
      const response = await fetch(`/api/brands/${brandId}/daily-analyses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });

      if (response.ok) {
        setEnabled(!enabled);
      }
    } catch {
      // Ignore errors
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className={cn(
      "rounded-xl border p-4 transition-all",
      enabled 
        ? "border-success/30 bg-success/5" 
        : "border-border bg-card",
      className
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2.5 rounded-lg",
            enabled ? "bg-success/10" : "bg-muted"
          )}>
            <Clock className={cn(
              "w-5 h-5",
              enabled ? "text-success" : "text-muted-foreground"
            )} />
          </div>
          <div>
            <p className="font-semibold">Daily Analyses</p>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Loading..." : enabled ? "Active" : "Paused"}
            </p>
          </div>
        </div>

        <button
          onClick={handleToggle}
          disabled={isLoading || isToggling}
          className={cn(
            "w-12 h-6 rounded-full transition-all duration-300 relative",
            enabled 
              ? "bg-success" 
              : "bg-muted",
            (isLoading || isToggling) && "opacity-50 cursor-not-allowed"
          )}
        >
          <div className={cn(
            "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300",
            enabled ? "translate-x-6" : "translate-x-0.5"
          )}>
            {(isLoading || isToggling) && (
              <Loader2 className="w-3 h-3 absolute top-1 left-1 animate-spin text-muted-foreground" />
            )}
          </div>
        </button>
      </div>
    </div>
  );
}

