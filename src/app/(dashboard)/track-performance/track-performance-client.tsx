"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  TrendingDown,
  Eye,
  Target,
  Calendar,
  ArrowRight,
  BarChart3,
  Activity,
  ChevronDown,
  Building2,
} from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { VisibilityTrendChart } from "@/components/charts/visibility-trend";
import { SupportedEngine } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandFavicon } from "@/components/ui/brand-favicon";

interface SimulationData {
  id: string;
  brand_id: string;
  engine: string;
  is_visible: boolean;
  created_at: string;
  selection_signals: unknown;
}

interface BrandData {
  id: string;
  name: string;
  domain: string;
}

interface TrackPerformanceClientProps {
  brands: BrandData[];
  allSimulations: SimulationData[];
}

export function TrackPerformanceClient({ brands, allSimulations }: TrackPerformanceClientProps) {
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(
    brands.length === 1 ? brands[0].id : null
  );

  const selectedBrand = brands.find(b => b.id === selectedBrandId);

  // Filter simulations based on selected brand
  const simulations = useMemo(() => {
    if (!selectedBrandId) return allSimulations;
    return allSimulations.filter(s => s.brand_id === selectedBrandId);
  }, [selectedBrandId, allSimulations]);

  // Calculate performance data
  const data = useMemo(() => {
    const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const cutoff7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Calculate visibility by period
    const calculateVisibility = (sims: SimulationData[], from: string) => {
      const filtered = sims.filter(s => s.created_at >= from);
      if (filtered.length === 0) return 0;
      return Math.round((filtered.filter(s => s.is_visible).length / filtered.length) * 100);
    };

    const visibility90 = calculateVisibility(simulations, cutoff90);
    const visibility30 = calculateVisibility(simulations, cutoff30);
    const visibility7 = calculateVisibility(simulations, cutoff7);

    // Calculate previous period for comparison
    const cutoff60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const prev30Sims = simulations.filter(s => s.created_at >= cutoff60 && s.created_at < cutoff30);
    const prev30Visibility = prev30Sims.length > 0 
      ? Math.round((prev30Sims.filter(s => s.is_visible).length / prev30Sims.length) * 100)
      : 0;

    const visibilityChange = visibility30 - prev30Visibility;

    // Build daily trend data
    const byDay: Record<string, { total: number; visible: number; byEngine: Partial<Record<SupportedEngine, { total: number; visible: number }>> }> = {};
    simulations.forEach((s) => {
      const day = String(s.created_at).slice(0, 10);
      if (!byDay[day]) byDay[day] = { total: 0, visible: 0, byEngine: {} };
      byDay[day].total += 1;
      if (s.is_visible) byDay[day].visible += 1;
      const eng = s.engine as SupportedEngine;
      if (!byDay[day].byEngine[eng]) byDay[day].byEngine[eng] = { total: 0, visible: 0 };
      byDay[day].byEngine[eng]!.total += 1;
      if (s.is_visible) byDay[day].byEngine[eng]!.visible += 1;
    });

    const days = Object.keys(byDay).sort((a, b) => a.localeCompare(b));
    const trend = days.map((d) => ({
      date: d,
      overall: byDay[d].total > 0 ? Math.round((byDay[d].visible / byDay[d].total) * 100) : 0,
      chatgpt:
        byDay[d].byEngine.chatgpt?.total
          ? Math.round((byDay[d].byEngine.chatgpt!.visible / byDay[d].byEngine.chatgpt!.total) * 100)
          : 0,
      perplexity:
        byDay[d].byEngine.perplexity?.total
          ? Math.round((byDay[d].byEngine.perplexity!.visible / byDay[d].byEngine.perplexity!.total) * 100)
          : 0,
      gemini:
        byDay[d].byEngine.gemini?.total
          ? Math.round((byDay[d].byEngine.gemini!.visible / byDay[d].byEngine.gemini!.total) * 100)
          : 0,
      grok:
        byDay[d].byEngine.grok?.total
          ? Math.round((byDay[d].byEngine.grok!.visible / byDay[d].byEngine.grok!.total) * 100)
          : 0,
    }));

    // Weekly performance
    const weeklyData = [];
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
      const weekSims = simulations.filter(s => {
        const d = new Date(s.created_at);
        return d >= weekStart && d < weekEnd;
      });
      const vis = weekSims.length > 0
        ? Math.round((weekSims.filter(s => s.is_visible).length / weekSims.length) * 100)
        : 0;
      weeklyData.push({
        week: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        visibility: vis,
        analyses: weekSims.length,
      });
    }

    // Engine breakdown
    const engineStats: Record<SupportedEngine, { total: number; visible: number }> = {
      chatgpt: { total: 0, visible: 0 },
      perplexity: { total: 0, visible: 0 },
      gemini: { total: 0, visible: 0 },
      grok: { total: 0, visible: 0 },
    };
    simulations.forEach(s => {
      const eng = s.engine as SupportedEngine;
      if (engineStats[eng]) {
        engineStats[eng].total++;
        if (s.is_visible) engineStats[eng].visible++;
      }
    });

    return {
      visibility: {
        current: visibility30,
        change: visibilityChange,
        day7: visibility7,
        day30: visibility30,
        day90: visibility90,
      },
      trend,
      weeklyData,
      engineStats,
      totalSimulations: simulations.length,
    };
  }, [simulations]);

  if (brands.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Track Performance</h1>
          <p className="text-muted-foreground mt-1">
            Monitor your brand&apos;s visibility across AI search engines
          </p>
        </div>
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <BarChart3 className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No brands yet</h3>
          <p className="text-muted-foreground max-w-sm mx-auto mb-6">
            Add your first brand to start tracking AI visibility and performance.
          </p>
          <Link href="/brands/new">
            <Button>Add Your First Brand</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header with Brand Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Track Performance</h1>
          <p className="text-muted-foreground mt-1">
            Monitor your brand&apos;s visibility across AI search engines
          </p>
        </div>
        
        {/* Brand Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2 min-w-[200px] justify-between">
              {selectedBrand ? (
                <div className="flex items-center gap-2">
                  <BrandFavicon domain={selectedBrand.domain} size="sm" />
                  <span className="truncate">{selectedBrand.name}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  <span>Select a brand</span>
                </div>
              )}
              <ChevronDown className="w-4 h-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[240px]">
            {brands.map((brand) => (
              <DropdownMenuCheckboxItem
                key={brand.id}
                checked={selectedBrandId === brand.id}
                onCheckedChange={() => setSelectedBrandId(brand.id)}
                className="gap-2"
              >
                <BrandFavicon domain={brand.domain} size="sm" />
                <span className="truncate">{brand.name}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* No Brand Selected State */}
      {!selectedBrandId && (
        <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-12 text-center">
          <Building2 className="w-12 h-12 mx-auto mb-4 text-primary opacity-70" />
          <h3 className="text-lg font-semibold mb-2">Select a Brand</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">
            Choose a brand from the dropdown above to view its performance metrics.
          </p>
        </div>
      )}

      {/* Performance Dashboard - Only show when brand is selected */}
      {selectedBrandId && (
        <>
          {/* Key Performance Indicators */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Eye className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">Current Visibility</p>
              </div>
              <p className="text-4xl font-bold">{data.visibility.current}%</p>
              <div className={`flex items-center gap-1 mt-2 text-sm ${
                data.visibility.change >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
                {data.visibility.change >= 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                <span>{data.visibility.change >= 0 ? '+' : ''}{data.visibility.change}% vs last 30 days</span>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">7-Day Visibility</p>
              </div>
              <p className="text-4xl font-bold">{data.visibility.day7}%</p>
              <p className="text-sm text-muted-foreground mt-2">Recent performance</p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Target className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">90-Day Average</p>
              </div>
              <p className="text-4xl font-bold">{data.visibility.day90}%</p>
              <p className="text-sm text-muted-foreground mt-2">Long-term trend</p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Activity className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Total Analyses</p>
              </div>
              <p className="text-4xl font-bold">{data.totalSimulations}</p>
              <p className="text-sm text-muted-foreground mt-2">Last 90 days</p>
            </div>
          </div>

          {/* Engine Breakdown */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(Object.entries(data.engineStats) as [SupportedEngine, { total: number; visible: number }][]).map(([engine, stats]) => {
              const visibility = stats.total > 0 ? Math.round((stats.visible / stats.total) * 100) : 0;
              const engineNames: Record<SupportedEngine, string> = {
                chatgpt: "ChatGPT",
                perplexity: "Perplexity",
                gemini: "Gemini",
                grok: "Grok",
              };
              const engineColors: Record<SupportedEngine, string> = {
                chatgpt: "from-green-500/20 to-green-500/5 border-green-500/30",
                perplexity: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/30",
                gemini: "from-blue-500/20 to-blue-500/5 border-blue-500/30",
                grok: "from-gray-500/20 to-gray-500/5 border-gray-500/30",
              };
              
              return (
                <div 
                  key={engine}
                  className={`rounded-xl border bg-gradient-to-br p-4 ${engineColors[engine]}`}
                >
                  <p className="text-sm font-medium mb-1">{engineNames[engine]}</p>
                  <p className="text-2xl font-bold">{visibility}%</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.visible}/{stats.total} visible
                  </p>
                </div>
              );
            })}
          </div>

          {/* Visibility Trend Chart */}
          <ChartCard
            title="Visibility Performance Over Time"
            description={`Track how ${selectedBrand?.name}'s visibility changes day-by-day across all AI engines`}
          >
            <VisibilityTrendChart
              data={data.trend}
              series={[
                { key: "overall", label: "Overall", color: "hsl(var(--primary))" },
                { key: "chatgpt", label: "ChatGPT", color: "hsl(160 84% 39%)" },
                { key: "perplexity", label: "Perplexity", color: "hsl(270 76% 55%)" },
                { key: "gemini", label: "Gemini", color: "hsl(217 91% 60%)" },
                { key: "grok", label: "Grok", color: "hsl(0 0% 45%)" },
              ]}
            />
          </ChartCard>

          {/* Weekly Performance */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold mb-4">Weekly Performance Summary</h2>
            <div className="overflow-x-auto">
              <div className="flex gap-3 min-w-max">
                {data.weeklyData.map((week, i) => (
                  <div key={i} className="flex-1 min-w-[100px] text-center">
                    <div className="text-xs text-muted-foreground mb-2">{week.week}</div>
                    <div 
                      className="mx-auto w-12 rounded-t-lg bg-primary/20 transition-all"
                      style={{ height: `${Math.max(week.visibility * 1.5, 10)}px` }}
                    />
                    <div 
                      className="mx-auto w-12 rounded-b-lg bg-primary"
                      style={{ height: `${Math.max(week.visibility * 0.5, 4)}px` }}
                    />
                    <div className="mt-2 text-lg font-bold">{week.visibility}%</div>
                    <div className="text-xs text-muted-foreground">{week.analyses} runs</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* View Brand Details Link */}
          <div className="rounded-2xl border border-border bg-card p-6 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Want more details?</h3>
              <p className="text-sm text-muted-foreground">
                View full analytics, prompts, and recommendations for {selectedBrand?.name}
              </p>
            </div>
            <Link href={`/brands/${selectedBrandId}`}>
              <Button className="gap-2">
                View Brand
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

