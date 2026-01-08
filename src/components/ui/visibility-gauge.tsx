"use client";

import { cn } from "@/lib/utils";

interface VisibilityGaugeProps {
  value: number; // 0-100
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  label?: string;
  className?: string;
}

export function VisibilityGauge({
  value,
  size = "md",
  showLabel = true,
  label = "Visibility",
  className,
}: VisibilityGaugeProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  
  // Calculate color based on value
  const getColor = (val: number) => {
    if (val >= 70) return { stroke: "#22c55e", bg: "rgba(34, 197, 94, 0.1)" }; // green
    if (val >= 40) return { stroke: "#eab308", bg: "rgba(234, 179, 8, 0.1)" }; // yellow
    return { stroke: "#ef4444", bg: "rgba(239, 68, 68, 0.1)" }; // red
  };
  
  const colors = getColor(clampedValue);
  
  // Size configurations
  const sizes = {
    sm: { width: 80, strokeWidth: 6, fontSize: "text-lg", labelSize: "text-xs" },
    md: { width: 120, strokeWidth: 8, fontSize: "text-2xl", labelSize: "text-sm" },
    lg: { width: 160, strokeWidth: 10, fontSize: "text-4xl", labelSize: "text-base" },
  };
  
  const config = sizes[size];
  const radius = (config.width - config.strokeWidth) / 2;
  const circumference = radius * Math.PI; // Half circle
  const offset = circumference - (clampedValue / 100) * circumference;
  
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative" style={{ width: config.width, height: config.width / 2 + 10 }}>
        <svg
          width={config.width}
          height={config.width / 2 + 10}
          className="transform -rotate-0"
        >
          {/* Background arc */}
          <path
            d={`M ${config.strokeWidth / 2} ${config.width / 2} 
                A ${radius} ${radius} 0 0 1 ${config.width - config.strokeWidth / 2} ${config.width / 2}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            className="text-muted/20"
            strokeLinecap="round"
          />
          {/* Value arc */}
          <path
            d={`M ${config.strokeWidth / 2} ${config.width / 2} 
                A ${radius} ${radius} 0 0 1 ${config.width - config.strokeWidth / 2} ${config.width / 2}`}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={config.strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        {/* Center value */}
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <span className={cn("font-bold", config.fontSize)} style={{ color: colors.stroke }}>
            {clampedValue}%
          </span>
        </div>
      </div>
      {showLabel && (
        <span className={cn("text-muted-foreground mt-1", config.labelSize)}>
          {label}
        </span>
      )}
    </div>
  );
}

interface MiniGaugeProps {
  value: number;
  className?: string;
}

export function MiniGauge({ value, className }: MiniGaugeProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  const getColor = (val: number) => {
    if (val >= 70) return "bg-green-500";
    if (val >= 40) return "bg-yellow-500";
    return "bg-red-500";
  };
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="w-16 h-2 rounded-full bg-muted/30 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", getColor(clampedValue))}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      <span className="text-sm font-medium">{clampedValue}%</span>
    </div>
  );
}




