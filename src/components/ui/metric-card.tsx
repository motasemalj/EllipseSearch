"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number; // percentage change
  trendLabel?: string;
  icon?: React.ReactNode;
  className?: string;
  variant?: "default" | "gradient" | "outline";
}

export function MetricCard({
  title,
  value,
  subtitle,
  trend,
  trendLabel,
  icon,
  className,
  variant = "default",
}: MetricCardProps) {
  const getTrendColor = (t: number) => {
    if (t > 0) return "text-green-500";
    if (t < 0) return "text-red-500";
    return "text-muted-foreground";
  };

  const getTrendIcon = (t: number) => {
    if (t > 0) return <TrendingUp className="w-3 h-3" />;
    if (t < 0) return <TrendingDown className="w-3 h-3" />;
    return <Minus className="w-3 h-3" />;
  };

  const variantStyles = {
    default: "bg-card border border-border",
    gradient: "bg-gradient-to-br from-primary/10 via-card to-card border border-primary/20",
    outline: "bg-transparent border-2 border-dashed border-muted-foreground/20",
  };

  return (
    <div className={cn("rounded-xl p-5 transition-all hover:shadow-lg", variantStyles[variant], className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        )}
      </div>
      {trend !== undefined && (
        <div className={cn("flex items-center gap-1 mt-3 text-xs", getTrendColor(trend))}>
          {getTrendIcon(trend)}
          <span className="font-medium">{trend > 0 ? "+" : ""}{trend}%</span>
          {trendLabel && <span className="text-muted-foreground ml-1">{trendLabel}</span>}
        </div>
      )}
    </div>
  );
}

interface StatRowProps {
  label: string;
  value: string | number;
  progress?: number;
  className?: string;
}

export function StatRow({ label, value, progress, className }: StatRowProps) {
  return (
    <div className={cn("flex items-center justify-between py-2", className)}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3">
        {progress !== undefined && (
          <div className="w-20 h-1.5 rounded-full bg-muted/30 overflow-hidden">
            <div 
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
        <span className="text-sm font-semibold tabular-nums">{value}</span>
      </div>
    </div>
  );
}




