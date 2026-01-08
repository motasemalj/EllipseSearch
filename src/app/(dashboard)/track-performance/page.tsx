import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  Medal,
  Activity,
} from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { VisibilityTrendChart } from "@/components/charts/visibility-trend";
import { SupportedEngine } from "@/types";

async function getPerformanceData(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  organizationId: string
) {
  // Get brands
  const { data: brands } = await supabase
    .from("brands")
    .select("id, name, domain")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  const brandIds = brands?.map((b) => b.id) || [];
  
  // Get simulations for the last 90 days
  const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: simulations } = await supabase
    .from("simulations")
    .select("brand_id, engine, is_visible, created_at, selection_signals")
    .in("brand_id", brandIds)
    .gte("created_at", cutoff90)
    .order("created_at", { ascending: true });

  // Calculate visibility by period
  const calculateVisibility = (sims: typeof simulations, from: string) => {
    const filtered = sims?.filter(s => s.created_at >= from) || [];
    if (filtered.length === 0) return 0;
    return Math.round((filtered.filter(s => s.is_visible).length / filtered.length) * 100);
  };

  const visibility90 = calculateVisibility(simulations, cutoff90);
  const visibility30 = calculateVisibility(simulations, cutoff30);
  const visibility7 = calculateVisibility(simulations, cutoff7);

  // Calculate previous period for comparison
  const cutoff60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const prev30Sims = simulations?.filter(s => s.created_at >= cutoff60 && s.created_at < cutoff30) || [];
  const prev30Visibility = prev30Sims.length > 0 
    ? Math.round((prev30Sims.filter(s => s.is_visible).length / prev30Sims.length) * 100)
    : 0;

  const visibilityChange = visibility30 - prev30Visibility;

  // Build daily trend data
  const byDay: Record<string, { total: number; visible: number; byEngine: Partial<Record<SupportedEngine, { total: number; visible: number }>> }> = {};
  simulations?.forEach((s) => {
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

  // Brand performance ranking
  const brandPerformance = brands?.map(brand => {
    const brandSims = simulations?.filter(s => s.brand_id === brand.id) || [];
    const visibility = brandSims.length > 0
      ? Math.round((brandSims.filter(s => s.is_visible).length / brandSims.length) * 100)
      : 0;
    
    // Calculate average scores
    let totalScore = 0;
    let scoreCount = 0;
    brandSims.forEach(sim => {
      const signals = sim.selection_signals as { gap_analysis?: { structure_score?: number; data_density_score?: number; directness_score?: number } } | null;
      if (signals?.gap_analysis) {
        const scores = [
          signals.gap_analysis.structure_score || 0,
          signals.gap_analysis.data_density_score || 0,
          signals.gap_analysis.directness_score || 0,
        ].filter(s => s > 0);
        if (scores.length > 0) {
          totalScore += scores.reduce((a, b) => a + b, 0) / scores.length;
          scoreCount++;
        }
      }
    });
    const avgScore = scoreCount > 0 ? Math.round((totalScore / scoreCount) * 20) : 0;

    return {
      id: brand.id,
      name: brand.name,
      domain: brand.domain,
      visibility,
      avgScore,
      simulationsCount: brandSims.length,
    };
  }).sort((a, b) => b.visibility - a.visibility) || [];

  // Weekly performance
  const weeklyData = [];
  for (let i = 11; i >= 0; i--) {
    const weekStart = new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
    const weekSims = simulations?.filter(s => {
      const d = new Date(s.created_at);
      return d >= weekStart && d < weekEnd;
    }) || [];
    const vis = weekSims.length > 0
      ? Math.round((weekSims.filter(s => s.is_visible).length / weekSims.length) * 100)
      : 0;
    weeklyData.push({
      week: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      visibility: vis,
      analyses: weekSims.length,
    });
  }

  return {
    brands: brands || [],
    visibility: {
      current: visibility30,
      change: visibilityChange,
      day7: visibility7,
      day30: visibility30,
      day90: visibility90,
    },
    trend,
    brandPerformance,
    weeklyData,
    totalSimulations: simulations?.length || 0,
  };
}

export default async function TrackPerformancePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) redirect("/login");

  const data = await getPerformanceData(supabase, profile.organization_id);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Track Performance</h1>
        <p className="text-muted-foreground mt-1">
          Monitor your brand&apos;s visibility and rank across AI search engines
        </p>
      </div>

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

      {/* Visibility Trend Chart */}
      <ChartCard
        title="Visibility Performance Over Time"
        description="Track how your visibility changes day-by-day across all AI engines"
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

      {/* Brand Performance Ranking */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Medal className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="font-semibold">Brand Performance Ranking</h2>
              <p className="text-sm text-muted-foreground">Compare visibility across your brands</p>
            </div>
          </div>
        </div>
        
        <div className="divide-y divide-border">
          {data.brandPerformance.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <BarChart3 className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p>No brands found. Add a brand to start tracking.</p>
              <Link href="/brands/new">
                <Button variant="outline" className="mt-4">Add Brand</Button>
              </Link>
            </div>
          ) : (
            data.brandPerformance.map((brand, i) => (
              <Link
                key={brand.id}
                href={`/brands/${brand.id}`}
                className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    i === 0 ? 'bg-amber-500 text-white' :
                    i === 1 ? 'bg-slate-400 text-white' :
                    i === 2 ? 'bg-amber-700 text-white' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-medium">{brand.name}</p>
                    <p className="text-sm text-muted-foreground">{brand.domain}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-2xl font-bold">{brand.visibility}%</p>
                    <p className="text-xs text-muted-foreground">Visibility</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">{brand.avgScore}</p>
                    <p className="text-xs text-muted-foreground">AEO Score</p>
                  </div>
                  <div className="text-right min-w-[60px]">
                    <p className="text-sm text-muted-foreground">{brand.simulationsCount} runs</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

