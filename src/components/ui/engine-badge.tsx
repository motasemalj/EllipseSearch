"use client";

import { cn } from "@/lib/utils";
import { SupportedEngine } from "@/types";
import Image from "next/image";

interface EngineBadgeProps {
  engine: SupportedEngine;
  showLabel?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  visibility?: number;
  className?: string;
}

// Favicon-based engine icons
function ChatGPTIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/images/engines/chatgpt.png"
      alt="ChatGPT"
      width={20}
      height={20}
      className={cn("object-contain", className)}
      unoptimized
    />
  );
}

function GeminiIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/images/engines/gemini.png"
      alt="Gemini"
      width={20}
      height={20}
      className={cn("object-contain", className)}
      unoptimized
    />
  );
}

function GrokIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/images/engines/grok.png"
      alt="Grok"
      width={20}
      height={20}
      className={cn("object-contain rounded-[3px]", className)}
      unoptimized
    />
  );
}

function PerplexityIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/images/engines/perplexity.png"
      alt="Perplexity"
      width={20}
      height={20}
      className={cn("object-contain rounded-[3px]", className)}
      unoptimized
    />
  );
}

const engineConfig: Record<SupportedEngine, { 
  name: string; 
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}> = {
  chatgpt: {
    name: "ChatGPT",
    icon: ChatGPTIcon,
    color: "text-[#10A37F]",
    bgColor: "bg-[#10A37F]/10 border-[#10A37F]/20",
  },
  perplexity: {
    name: "Perplexity",
    icon: PerplexityIcon,
    color: "text-[#20808D]",
    bgColor: "bg-[#20808D]/10 border-[#20808D]/20",
  },
  gemini: {
    name: "Gemini",
    icon: GeminiIcon,
    color: "text-[#8E75B2]",
    bgColor: "bg-[#8E75B2]/10 border-[#8E75B2]/20",
  },
  grok: {
    name: "Grok",
    icon: GrokIcon,
    color: "text-foreground",
    bgColor: "bg-foreground/10 border-foreground/20",
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
    xs: "text-[10px] px-1.5 py-0.5 gap-0.5",
    sm: "text-xs px-2 py-0.5 gap-1",
    md: "text-sm px-3 py-1.5 gap-1.5",
    lg: "text-base px-4 py-2 gap-2",
  };

  const iconSizes = {
    xs: "w-2.5 h-2.5",
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

// Export individual icons for use elsewhere
export { ChatGPTIcon, GeminiIcon, GrokIcon, PerplexityIcon };

// Export config for use in other components
export { engineConfig };
