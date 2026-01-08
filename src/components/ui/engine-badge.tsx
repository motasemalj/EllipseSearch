"use client";

import { cn } from "@/lib/utils";
import { SupportedEngine } from "@/types";
import { Bot, Sparkles, Zap, Search } from "lucide-react";

interface EngineBadgeProps {
  engine: SupportedEngine;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  visibility?: number;
  className?: string;
}

const engineConfig: Record<SupportedEngine, { 
  name: string; 
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}> = {
  chatgpt: {
    name: "ChatGPT",
    icon: Bot,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
  },
  perplexity: {
    name: "Perplexity",
    icon: Search,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/20",
  },
  gemini: {
    name: "Gemini",
    icon: Sparkles,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/20",
  },
  grok: {
    name: "Grok",
    icon: Zap,
    color: "text-orange-400",
    bgColor: "bg-orange-500/10 border-orange-500/20",
  },
};

export function EngineBadge({ 
  engine, 
  showLabel = true, 
  size = "md",
  visibility,
  className 
}: EngineBadgeProps) {
  const config = engineConfig[engine];
  const Icon = config.icon;

  const sizes = {
    sm: "text-xs px-2 py-0.5 gap-1",
    md: "text-sm px-3 py-1.5 gap-1.5",
    lg: "text-base px-4 py-2 gap-2",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  return (
    <div 
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        config.bgColor,
        sizes[size],
        className
      )}
    >
      <Icon className={cn(iconSizes[size], config.color)} />
      {showLabel && <span className={config.color}>{config.name}</span>}
      {visibility !== undefined && (
        <span className={cn("font-bold ml-1", getVisibilityColor(visibility))}>
          {visibility}%
        </span>
      )}
    </div>
  );
}

function getVisibilityColor(value: number) {
  if (value >= 70) return "text-green-400";
  if (value >= 40) return "text-yellow-400";
  return "text-red-400";
}

interface EngineGridProps {
  engines: { engine: SupportedEngine; visibility: number }[];
  className?: string;
}

export function EngineGrid({ engines, className }: EngineGridProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      {engines.map(({ engine, visibility }) => (
        <EngineCard key={engine} engine={engine} visibility={visibility} />
      ))}
    </div>
  );
}

interface EngineCardProps {
  engine: SupportedEngine;
  visibility: number;
  className?: string;
}

export function EngineCard({ engine, visibility, className }: EngineCardProps) {
  const config = engineConfig[engine];
  const Icon = config.icon;

  return (
    <div className={cn(
      "p-4 rounded-xl border transition-all hover:scale-105 cursor-pointer",
      config.bgColor,
      className
    )}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-5 h-5", config.color)} />
        <span className={cn("font-semibold text-sm", config.color)}>{config.name}</span>
      </div>
      <div className="flex items-end gap-1">
        <span className={cn("text-2xl font-bold", getVisibilityColor(visibility))}>
          {visibility}%
        </span>
        <span className="text-xs text-muted-foreground mb-1">visible</span>
      </div>
    </div>
  );
}




