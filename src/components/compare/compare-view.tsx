"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CompareBarChart, CompareTrendChart } from "@/components/compare/compare-charts";
import { BrandFavicon } from "@/components/ui/brand-favicon";
import { 
  ArrowLeft, 
  ArrowLeftRight, 
  GitCompareArrows, 
  TrendingUp, 
  TrendingDown,
  Minus,
  BarChart3,
  LineChart,
  Layers,
  MessageSquare,
  Info,
  Zap,
  Grid3X3,
  Eye,
} from "lucide-react";
import { ChatGPTIcon, PerplexityIcon, GeminiIcon, GrokIcon } from "@/components/ui/engine-badge";
import { cn } from "@/lib/utils";
import type { SupportedEngine } from "@/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Mode = "sets" | "prompts";

export type CompareOption = {
  id: string;
  label: string;
  secondary?: string;
};

export type CompareStats = {
  total: number;
  visible: number;
  visibilityPct: number;
  byEngine: Record<SupportedEngine, { total: number; visible: number; visibilityPct: number }>;
  avgScores?: { structure: number; dataDensity: number; directness: number };
};

export type MatrixItem = {
  promptId: string;
  promptText: string;
  group: "a" | "b";
  engines: Record<SupportedEngine, { visible: number; total: number; pct: number }>;
};

export type ComparePayload = {
  brandId: string;
  brandName: string;
  brandDomain: string;
  mode: Mode;
  aId: string;
  bId: string;
  options: {
    sets: CompareOption[];
    prompts: CompareOption[];
  };
  label: {
    a: string;
    b: string;
  };
  stats: {
    a: CompareStats;
    b: CompareStats;
  };
  charts: {
    byEngine: Array<{ label: string; a: number; b: number }>;
    trend: Array<{ date: string; a: number; b: number }>;
  };
  matrix: MatrixItem[];
};

function SectionInfo({ description }: { description: string }) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <Info className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help transition-colors" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs z-[100]">
          <p className="text-sm">{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function CompareView({ payload }: { payload: ComparePayload }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [activeTab, setActiveTab] = useState<"engine" | "trend">("engine");

  const mode: Mode = payload.mode;

  const aVisibility = payload.stats.a.visibilityPct;
  const bVisibility = payload.stats.b.visibilityPct;
  const delta = useMemo(() => Math.round((aVisibility - bVisibility) * 10) / 10, [aVisibility, bVisibility]);

  const setParam = (next: Partial<{ mode: Mode; a: string; b: string }>) => {
    const params = new URLSearchParams(sp?.toString() ?? "");
    if (next.mode) params.set("mode", next.mode);
    if (next.a) params.set("a", next.a);
    if (next.b) params.set("b", next.b);
    router.push(`${pathname}?${params.toString()}`);
    router.refresh();
  };

  const swap = () => setParam({ a: payload.bId, b: payload.aId });

  const options = mode === "sets" ? payload.options.sets : payload.options.prompts;
  const hasData = options.length > 0 && (payload.stats.a.total > 0 || payload.stats.b.total > 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link href={`/brands/${payload.brandId}`}>
            <Button variant="ghost" size="icon" className="mt-1">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <BrandFavicon domain={payload.brandDomain} size="lg" className="mt-1" />
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <GitCompareArrows className="w-4 h-4" />
              <span>Compare Performance</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{payload.brandName}</h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              Compare visibility and performance metrics across different prompt sets or individual prompts 
              to identify optimization opportunities.
            </p>
          </div>
        </div>
      </div>

      {/* Mode Selection */}
      <div className="flex items-center gap-3 p-1 bg-muted/50 rounded-lg w-fit">
        <button
          onClick={() => setParam({ mode: "sets" })}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
            mode === "sets" 
              ? "bg-background shadow-sm text-foreground" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Layers className="w-4 h-4" />
          Prompt Sets
        </button>
        <button
          onClick={() => setParam({ mode: "prompts" })}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
            mode === "prompts" 
              ? "bg-background shadow-sm text-foreground" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <MessageSquare className="w-4 h-4" />
          Individual Prompts
        </button>
      </div>

      {options.length === 0 ? (
        <EmptyState mode={mode} brandId={payload.brandId} />
      ) : (
        <>
          {/* Comparison Picker */}
          <ComparisonPicker
            aId={payload.aId}
            bId={payload.bId}
            options={options}
            aLabel={payload.label.a}
            bLabel={payload.label.b}
            mode={mode}
            onChange={(next) => setParam(next)}
            onSwap={swap}
          />

          {/* Summary Cards */}
          {hasData ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <VisibilityCard
                  label="Selection A"
                  name={payload.label.a}
                  pct={aVisibility}
                  total={payload.stats.a.total}
                  visible={payload.stats.a.visible}
                  variant="primary"
                />
                <VisibilityCard
                  label="Selection B"
                  name={payload.label.b}
                  pct={bVisibility}
                  total={payload.stats.b.total}
                  visible={payload.stats.b.visible}
                  variant="secondary"
                />
                <DeltaCard delta={delta} aName={payload.label.a} bName={payload.label.b} />
              </div>

              {/* Charts Section */}
              <Card className="overflow-hidden">
                <CardHeader className="border-b bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">Performance Analysis</CardTitle>
                      <SectionInfo description="Visualize and compare visibility metrics between your two selections across different AI engines and over time." />
                    </div>
                    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
                      <button
                        onClick={() => setActiveTab("engine")}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                          activeTab === "engine" 
                            ? "bg-background shadow-sm" 
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <BarChart3 className="w-4 h-4" />
                        By Engine
                      </button>
                      <button
                        onClick={() => setActiveTab("trend")}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                          activeTab === "trend" 
                            ? "bg-background shadow-sm" 
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <LineChart className="w-4 h-4" />
                        Over Time
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {activeTab === "engine" ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium">Visibility by AI Engine</h3>
                          <p className="text-sm text-muted-foreground">
                            Compare how each AI engine includes your brand across the two selections
                          </p>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-primary" />
                            <span className="text-muted-foreground">Selection A</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-muted-foreground/50" />
                            <span className="text-muted-foreground">Selection B</span>
                          </div>
                        </div>
                      </div>
                      <CompareBarChart data={payload.charts.byEngine} aKey="a" bKey="b" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium">Visibility Trend (Last 90 Days)</h3>
                          <p className="text-sm text-muted-foreground">
                            Track how visibility has changed over time for each selection
                          </p>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-primary" />
                            <span className="text-muted-foreground">Selection A</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-muted-foreground/50" />
                            <span className="text-muted-foreground">Selection B</span>
                          </div>
                        </div>
                      </div>
                      {payload.charts.trend.length > 0 ? (
                        <CompareTrendChart data={payload.charts.trend} aKey="a" bKey="b" />
                      ) : (
                        <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                          <p>Not enough historical data to display trends</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Engine Breakdown */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">Engine Breakdown</h2>
                  <SectionInfo description="Detailed comparison of visibility metrics for each AI engine, showing the number of analyses and visible results." />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {(["chatgpt", "perplexity", "gemini", "grok"] as SupportedEngine[]).map((engine) => (
                    <EngineCompareCard
                      key={engine}
                      engine={engine}
                      statsA={payload.stats.a.byEngine[engine]}
                      statsB={payload.stats.b.byEngine[engine]}
                    />
                  ))}
                </div>
              </div>

              {/* Results Matrix */}
              {payload.matrix && payload.matrix.length > 0 && (
                <ResultsMatrix 
                  data={payload.matrix} 
                  aLabel={payload.label.a} 
                  bLabel={payload.label.b}
                />
              )}
            </>
          ) : (
            <Card className="p-12">
              <div className="text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto">
                  <Zap className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg">No analysis data yet</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Run analyses on your prompts to start comparing performance across different selections.
                </p>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({ mode, brandId }: { mode: Mode; brandId: string }) {
  return (
    <Card className="p-12">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto">
          <GitCompareArrows className="w-8 h-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-xl">No {mode === "sets" ? "Prompt Sets" : "Prompts"} to Compare</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {mode === "sets" 
              ? "Create at least two prompt sets to start comparing their performance across AI engines."
              : "Add prompts to your brand to start comparing their individual performance."}
          </p>
        </div>
        <Link href={`/brands/${brandId}`}>
          <Button className="mt-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Brand
          </Button>
        </Link>
      </div>
    </Card>
  );
}

function ComparisonPicker({
  aId,
  bId,
  options,
  aLabel,
  bLabel,
  mode,
  onChange,
  onSwap,
}: {
  aId: string;
  bId: string;
  options: CompareOption[];
  aLabel: string;
  bLabel: string;
  mode: Mode;
  onChange: (next: Partial<{ a: string; b: string }>) => void;
  onSwap: () => void;
}) {
  return (
    <div className="relative">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr] gap-4 items-stretch">
        {/* Selection A */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-primary/60" />
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                A
              </div>
              <CardTitle className="text-sm text-muted-foreground">
                {mode === "sets" ? "Prompt Set" : "Prompt"} A
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={aId} onValueChange={(v) => onChange({ a: v })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={`Select ${mode === "sets" ? "set" : "prompt"}...`} />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    <div className="flex flex-col items-start">
                      <span className="truncate max-w-[300px]">{o.label}</span>
                      {o.secondary && (
                        <span className="text-xs text-muted-foreground">{o.secondary}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground truncate" title={aLabel}>
              {aLabel}
            </p>
          </CardContent>
        </Card>

        {/* Swap Button */}
        <div className="flex items-center justify-center">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={onSwap}
            className="rounded-full w-10 h-10 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Selection B */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-muted-foreground/60 to-muted-foreground/30" />
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold">
                B
              </div>
              <CardTitle className="text-sm text-muted-foreground">
                {mode === "sets" ? "Prompt Set" : "Prompt"} B
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={bId} onValueChange={(v) => onChange({ b: v })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={`Select ${mode === "sets" ? "set" : "prompt"}...`} />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    <div className="flex flex-col items-start">
                      <span className="truncate max-w-[300px]">{o.label}</span>
                      {o.secondary && (
                        <span className="text-xs text-muted-foreground">{o.secondary}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground truncate" title={bLabel}>
              {bLabel}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function VisibilityCard({
  label,
  name,
  pct,
  total,
  visible,
  variant,
}: {
  label: string;
  name: string;
  pct: number;
  total: number;
  visible: number;
  variant: "primary" | "secondary";
}) {
  const isPrimary = variant === "primary";
  
  return (
    <Card className={cn(
      "relative overflow-hidden",
      isPrimary && "ring-1 ring-primary/20"
    )}>
      {isPrimary && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-primary/60" />
      )}
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                isPrimary ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {isPrimary ? "A" : "B"}
              </div>
              <span className="text-sm text-muted-foreground">{label}</span>
            </div>
          </div>
          
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight">{pct}</span>
              <span className="text-xl text-muted-foreground">%</span>
            </div>
            <p className="text-sm text-muted-foreground truncate mt-1" title={name}>
              {name}
            </p>
          </div>

          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-500",
                isPrimary ? "bg-primary" : "bg-muted-foreground/50"
              )}
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{visible} visible</span>
            <span className="text-muted-foreground">{total} total</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DeltaCard({ delta, aName, bName }: { delta: number; aName: string; bName: string }) {
  const isPositive = delta > 0;
  const isNegative = delta < 0;
  const isNeutral = delta === 0;

  return (
    <Card className="relative overflow-hidden bg-gradient-to-br from-muted/50 to-transparent">
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {isPositive && <TrendingUp className="w-5 h-5 text-green-500" />}
            {isNegative && <TrendingDown className="w-5 h-5 text-red-500" />}
            {isNeutral && <Minus className="w-5 h-5 text-muted-foreground" />}
            <span className="text-sm text-muted-foreground">Difference (A − B)</span>
          </div>
          
          <div>
            <div className="flex items-baseline gap-1">
              <span className={cn(
                "text-4xl font-bold tracking-tight",
                isPositive && "text-green-500",
                isNegative && "text-red-500",
                isNeutral && "text-muted-foreground"
              )}>
                {isPositive ? "+" : ""}{delta}
              </span>
              <span className="text-xl text-muted-foreground">%</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {isPositive && "Selection A outperforms B"}
              {isNegative && "Selection B outperforms A"}
              {isNeutral && "Both selections perform equally"}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
            <p className="truncate" title={aName}>A: {aName}</p>
            <p className="truncate" title={bName}>B: {bName}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EngineCompareCard({
  engine,
  statsA,
  statsB,
}: {
  engine: SupportedEngine;
  statsA: { total: number; visible: number; visibilityPct: number };
  statsB: { total: number; visible: number; visibilityPct: number };
}) {
  const engineNames: Record<SupportedEngine, string> = {
    chatgpt: "ChatGPT",
    perplexity: "Perplexity",
    gemini: "Gemini",
    grok: "Grok",
  };

  const engineColors: Record<SupportedEngine, string> = {
    chatgpt: "from-green-500/20 to-green-500/5",
    perplexity: "from-blue-500/20 to-blue-500/5",
    gemini: "from-purple-500/20 to-purple-500/5",
    grok: "from-orange-500/20 to-orange-500/5",
  };

  const delta = statsA.visibilityPct - statsB.visibilityPct;

  return (
    <Card className={cn(
      "relative overflow-hidden",
      `bg-gradient-to-br ${engineColors[engine]}`
    )}>
      <CardContent className="pt-5 pb-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{engineNames[engine]}</h3>
            {delta !== 0 && (
              <span className={cn(
                "text-xs font-medium px-1.5 py-0.5 rounded",
                delta > 0 ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
              )}>
                {delta > 0 ? "+" : ""}{Math.round(delta)}%
              </span>
            )}
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">
                A
              </div>
              <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${statsA.visibilityPct}%` }}
                />
              </div>
              <span className="text-xs font-medium w-10 text-right">{statsA.visibilityPct}%</span>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold">
                B
              </div>
              <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-muted-foreground/50 rounded-full"
                  style={{ width: `${statsB.visibilityPct}%` }}
                />
              </div>
              <span className="text-xs font-medium w-10 text-right">{statsB.visibilityPct}%</span>
            </div>
          </div>

          <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>A: {statsA.visible}/{statsA.total}</span>
              <span>B: {statsB.visible}/{statsB.total}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Results Matrix Component
function ResultsMatrix({ 
  data, 
  aLabel, 
  bLabel 
}: { 
  data: MatrixItem[]; 
  aLabel: string; 
  bLabel: string; 
}) {
  const engines: SupportedEngine[] = ["chatgpt", "perplexity", "gemini", "grok"];
  
  const engineIcons: Record<SupportedEngine, React.ReactNode> = {
    chatgpt: <ChatGPTIcon className="w-4 h-4" />,
    perplexity: <PerplexityIcon className="w-4 h-4" />,
    gemini: <GeminiIcon className="w-4 h-4" />,
    grok: <GrokIcon className="w-4 h-4" />,
  };
  
  const engineNames: Record<SupportedEngine, string> = {
    chatgpt: "ChatGPT",
    perplexity: "Perplexity",
    gemini: "Gemini",
    grok: "Grok",
  };

  const getVisibilityColor = (pct: number) => {
    if (pct >= 70) return "bg-green-500";
    if (pct >= 40) return "bg-amber-500";
    if (pct > 0) return "bg-red-500";
    return "bg-muted";
  };

  const getVisibilityBgColor = (pct: number) => {
    if (pct >= 70) return "bg-green-500/10";
    if (pct >= 40) return "bg-amber-500/10";
    if (pct > 0) return "bg-red-500/10";
    return "bg-muted/50";
  };

  // Separate data by group
  const groupA = data.filter(d => d.group === "a");
  const groupB = data.filter(d => d.group === "b");

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Grid3X3 className="w-5 h-5 text-primary" />
          <div>
            <CardTitle className="text-lg">Results Matrix</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              Visibility results for each prompt across AI engines
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="text-left p-3 text-sm font-medium text-muted-foreground w-[40%]">
                  Prompt
                </th>
                {engines.map((engine) => (
                  <th key={engine} className="p-3 text-center w-[15%]">
                    <div className="flex items-center justify-center gap-1.5">
                      {engineIcons[engine]}
                      <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
                        {engineNames[engine]}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Group A Section */}
              {groupA.length > 0 && (
                <>
                  <tr className="bg-primary/5 border-b">
                    <td colSpan={5} className="p-2">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                          A
                        </div>
                        <span className="text-sm font-medium truncate">{aLabel}</span>
                        <span className="text-xs text-muted-foreground">
                          ({groupA.length} prompt{groupA.length !== 1 ? "s" : ""})
                        </span>
                      </div>
                    </td>
                  </tr>
                  {groupA.map((item) => (
                    <MatrixRow key={item.promptId} item={item} engines={engines} getVisibilityColor={getVisibilityColor} getVisibilityBgColor={getVisibilityBgColor} />
                  ))}
                </>
              )}
              
              {/* Group B Section */}
              {groupB.length > 0 && (
                <>
                  <tr className="bg-muted/30 border-b">
                    <td colSpan={5} className="p-2">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold">
                          B
                        </div>
                        <span className="text-sm font-medium truncate">{bLabel}</span>
                        <span className="text-xs text-muted-foreground">
                          ({groupB.length} prompt{groupB.length !== 1 ? "s" : ""})
                        </span>
                      </div>
                    </td>
                  </tr>
                  {groupB.map((item) => (
                    <MatrixRow key={item.promptId} item={item} engines={engines} getVisibilityColor={getVisibilityColor} getVisibilityBgColor={getVisibilityBgColor} />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Legend */}
        <div className="px-4 py-3 border-t bg-muted/10 flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span className="text-muted-foreground">High (70%+)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-amber-500" />
              <span className="text-muted-foreground">Medium (40-70%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-red-500" />
              <span className="text-muted-foreground">Low (&lt;40%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-muted border" />
              <span className="text-muted-foreground">No data</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Eye className="w-3.5 h-3.5" />
            <span>Visible / Total</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MatrixRow({ 
  item, 
  engines,
  getVisibilityColor,
  getVisibilityBgColor,
}: { 
  item: MatrixItem; 
  engines: SupportedEngine[];
  getVisibilityColor: (pct: number) => string;
  getVisibilityBgColor: (pct: number) => string;
}) {
  return (
    <tr className="border-b hover:bg-muted/10 transition-colors">
      <td className="p-3">
        <p className="text-sm truncate max-w-[300px]" title={item.promptText}>
          {item.promptText}
        </p>
      </td>
      {engines.map((engine) => {
        const engineData = item.engines[engine];
        const hasData = engineData.total > 0;
        
        return (
          <td key={engine} className="p-2 text-center">
            <div className={cn(
              "inline-flex flex-col items-center justify-center rounded-lg p-2 min-w-[70px] transition-colors",
              hasData ? getVisibilityBgColor(engineData.pct) : "bg-muted/30"
            )}>
              {hasData ? (
                <>
                  <div className="flex items-center gap-1">
                    <div className={cn("w-2 h-2 rounded-full", getVisibilityColor(engineData.pct))} />
                    <span className="text-sm font-semibold">{engineData.pct}%</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5">
                    {engineData.visible}/{engineData.total}
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          </td>
        );
      })}
    </tr>
  );
}
