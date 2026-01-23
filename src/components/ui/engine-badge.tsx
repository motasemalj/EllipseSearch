"use client";

import { cn } from "@/lib/utils";
import { SupportedEngine } from "@/types";

interface EngineBadgeProps {
  engine: SupportedEngine;
  showLabel?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  visibility?: number;
  className?: string;
}

// ChatGPT Logo (OpenAI sparkle/flower)
function ChatGPTIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  );
}

// Gemini Logo (Google's star)
function GeminiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path 
        d="M12 24C12 21.8133 11.5467 19.7467 10.6933 17.8C9.84 15.8533 8.72 14.1333 7.28 12.64C5.84 11.1467 4.17333 9.92 2.28 8.96C0.386667 8 -0.373333 7.54667 0.24 7.6C0.853333 7.65333 2.22667 8.10667 4.36 8.96C6.49333 9.81333 8.21333 10.9333 9.52 12.32C10.8267 13.7067 11.8133 15.3067 12.48 17.12C13.1467 18.9333 13.5467 20.5067 13.68 21.84L12 24ZM12 24C12 21.8133 12.4533 19.7467 13.3067 17.8C14.16 15.8533 15.28 14.1333 16.72 12.64C18.16 11.1467 19.8267 9.92 21.72 8.96C23.6133 8 24.3733 7.54667 23.76 7.6C23.1467 7.65333 21.7733 8.10667 19.64 8.96C17.5067 9.81333 15.7867 10.9333 14.48 12.32C13.1733 13.7067 12.1867 15.3067 11.52 17.12C10.8533 18.9333 10.4533 20.5067 10.32 21.84L12 24Z" 
        fill="url(#gemini-gradient)"
      />
      <path 
        d="M12 0C12 2.18667 11.5467 4.25333 10.6933 6.2C9.84 8.14667 8.72 9.86667 7.28 11.36C5.84 12.8533 4.17333 14.08 2.28 15.04C0.386667 16 -0.373333 16.4533 0.24 16.4C0.853333 16.3467 2.22667 15.8933 4.36 15.04C6.49333 14.1867 8.21333 13.0667 9.52 11.68C10.8267 10.2933 11.8133 8.69333 12.48 6.88C13.1467 5.06667 13.5467 3.49333 13.68 2.16L12 0ZM12 0C12 2.18667 12.4533 4.25333 13.3067 6.2C14.16 8.14667 15.28 9.86667 16.72 11.36C18.16 12.8533 19.8267 14.08 21.72 15.04C23.6133 16 24.3733 16.4533 23.76 16.4C23.1467 16.3467 21.7733 15.8933 19.64 15.04C17.5067 14.1867 15.7867 13.0667 14.48 11.68C13.1733 10.2933 12.1867 8.69333 11.52 6.88C10.8533 5.06667 10.4533 3.49333 10.32 2.16L12 0Z" 
        fill="url(#gemini-gradient)"
      />
      <defs>
        <linearGradient id="gemini-gradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4285F4" />
          <stop offset="0.5" stopColor="#9B72CB" />
          <stop offset="1" stopColor="#D96570" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// Grok Logo (xAI X mark)
function GrokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

// Perplexity Logo (abstract circular wave)
function PerplexityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1.5L4.5 6v12l7.5 4.5 7.5-4.5V6L12 1.5zm0 2.12l5.5 3.3v2.08l-5.5-3.3-5.5 3.3V6.92l5.5-3.3zm-5.5 6.5l5.5 3.3 5.5-3.3v2.08l-5.5 3.3-5.5-3.3v-2.08zm5.5 9.26l-5.5-3.3v-2.08l5.5 3.3 5.5-3.3v2.08l-5.5 3.3z"/>
    </svg>
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
