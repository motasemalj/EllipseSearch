import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  Settings, 
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  Search,
  Plus,
  BarChart3,
  GitCompareArrows,
} from "lucide-react";
import { RunAnalysisButton } from "@/components/brands/run-analysis-button";
import { ChartCard } from "@/components/charts/chart-card";
import { VisibilityTrendChart } from "@/components/charts/visibility-trend";
import { SimulationsVolumeChart } from "@/components/charts/simulations-volume";
import { EngineMixChart } from "@/components/charts/engine-mix";
import type { SupportedEngine } from "@/types";

interface KeywordSetPageProps {
  params: { brandId: string; keywordSetId: string };
}

export default async function KeywordSetPage({ params }: KeywordSetPageProps) {
  const { brandId, keywordSetId } = params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) redirect("/login");

  // Get brand
  const { data: brand } = await supabase
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!brand) notFound();

  // Get keyword set with keywords
  const { data: keywordSet } = await supabase
    .from("keyword_sets")
    .select("*, keywords(*)")
    .eq("id", keywordSetId)
    .eq("brand_id", brandId)
    .single();

  if (!keywordSet) notFound();

  // Get batches
  const { data: batches } = await supabase
    .from("analysis_batches")
    .select("*")
    .eq("keyword_set_id", keywordSetId)
    .order("created_at", { ascending: false });

  const keywords = keywordSet.keywords || [];

  // Compute overall visibility for this keyword set (last 90 days)
  const keywordIds = (keywords as { id: string }[]).map((k) => k.id);
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: simulations } = keywordIds.length
    ? await supabase
        .from("simulations")
        .select("keyword_id, engine, is_visible, created_at")
        .in("keyword_id", keywordIds)
        .gte("created_at", cutoff)
    : { data: [] as Array<{ keyword_id: string; engine: SupportedEngine; is_visible: boolean; created_at: string }> };

  const totalSims = simulations?.length || 0;
  const visibleSims = simulations?.filter((s) => s.is_visible).length || 0;
  const avgVisibility = totalSims > 0 ? Math.round((visibleSims / totalSims) * 100) : 0;

  const perKeyword: Record<
    string,
    {
      total: number;
      visible: number;
      byEngine: Partial<Record<SupportedEngine, { total: number; visible: number }>>;
      lastSeenAt?: string;
    }
  > = {};

  const byDay: Record<
    string,
    { total: number; visible: number; byEngine: Partial<Record<SupportedEngine, { total: number; visible: number }>> }
  > = {};

  simulations?.forEach((s) => {
    const kid = String(s.keyword_id);
    const eng = s.engine as SupportedEngine;
    const vis = Boolean(s.is_visible);

    if (!perKeyword[kid]) perKeyword[kid] = { total: 0, visible: 0, byEngine: {} };
    perKeyword[kid].total += 1;
    if (vis) perKeyword[kid].visible += 1;
    if (!perKeyword[kid].byEngine[eng]) perKeyword[kid].byEngine[eng] = { total: 0, visible: 0 };
    perKeyword[kid].byEngine[eng]!.total += 1;
    if (vis) perKeyword[kid].byEngine[eng]!.visible += 1;
    perKeyword[kid].lastSeenAt = perKeyword[kid].lastSeenAt
      ? (perKeyword[kid].lastSeenAt as string) > (s.created_at as string)
        ? perKeyword[kid].lastSeenAt
        : s.created_at
      : (s.created_at as string);

    const day = String(s.created_at).slice(0, 10);
    if (!byDay[day]) byDay[day] = { total: 0, visible: 0, byEngine: {} };
    byDay[day].total += 1;
    if (vis) byDay[day].visible += 1;
    if (!byDay[day].byEngine[eng]) byDay[day].byEngine[eng] = { total: 0, visible: 0 };
    byDay[day].byEngine[eng]!.total += 1;
    if (vis) byDay[day].byEngine[eng]!.visible += 1;
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

  const volume = days.map((d) => ({ date: d, total: byDay[d].total }));

  const engineMixAgg: Record<SupportedEngine, number> = { chatgpt: 0, perplexity: 0, gemini: 0, grok: 0 };
  simulations?.forEach((s) => {
    const eng = s.engine as SupportedEngine;
    engineMixAgg[eng] = (engineMixAgg[eng] || 0) + 1;
  });
  const engineMix = [
    { name: "ChatGPT", value: engineMixAgg.chatgpt, color: "hsl(var(--primary))" },
    { name: "Perplexity", value: engineMixAgg.perplexity, color: "hsl(270 76% 55%)" },
    { name: "Gemini", value: engineMixAgg.gemini, color: "hsl(217 91% 60%)" },
    { name: "Grok", value: engineMixAgg.grok, color: "hsl(0 0% 45%)" },
  ].filter((x) => x.value > 0);

  const statusConfig: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
    completed: { icon: <CheckCircle2 className="w-4 h-4" />, color: "text-green-500", bg: "bg-green-500/10" },
    processing: { icon: <Loader2 className="w-4 h-4 animate-spin" />, color: "text-blue-500", bg: "bg-blue-500/10" },
    queued: { icon: <Clock className="w-4 h-4" />, color: "text-yellow-500", bg: "bg-yellow-500/10" },
    failed: { icon: <XCircle className="w-4 h-4" />, color: "text-red-500", bg: "bg-red-500/10" },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Link href={`/brands/${brandId}/keyword-sets`}>
            <Button variant="ghost" size="icon" className="mt-1">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="text-sm text-muted-foreground mb-1">
              <Link href={`/brands/${brandId}`} className="hover:text-foreground">
                {brand.name}
              </Link>
              <span className="mx-2">/</span>
              <span>Keyword Sets</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{keywordSet.name}</h1>
            {keywordSet.description && (
              <p className="text-muted-foreground mt-1">{keywordSet.description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <RunAnalysisButton 
            brandId={brandId} 
            keywordSetId={keywordSetId}
            keywordsCount={keywords.length}
          />
          <Link href={`/brands/${brandId}/compare?mode=sets&a=${keywordSetId}`}>
            <Button variant="outline" className="gap-2">
              <GitCompareArrows className="w-4 h-4" />
              Compare
            </Button>
          </Link>
          <Link href={`/brands/${brandId}/keyword-sets/${keywordSetId}/edit`}>
            <Button variant="outline" size="icon">
              <Settings className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Prompts</p>
          <p className="text-2xl font-bold mt-1">{keywords.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Runs</p>
          <p className="text-2xl font-bold mt-1">{batches?.length || 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Last Run</p>
          <p className="text-2xl font-bold mt-1">
            {batches?.[0] 
              ? new Date(batches[0].created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : "—"
            }
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Avg. Visibility</p>
          <p className="text-2xl font-bold mt-1">{avgVisibility}%</p>
          <p className="text-xs text-muted-foreground mt-1">Last 90 days</p>
        </div>
      </div>

      {/* Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ChartCard
            title="Visibility trend (last 90 days)"
            description="Daily visibility for this keyword set."
          >
            <VisibilityTrendChart
              data={trend}
              series={[
                { key: "overall", label: "Overall", color: "hsl(var(--primary))" },
                { key: "chatgpt", label: "ChatGPT", color: "hsl(160 84% 39%)" },
                { key: "perplexity", label: "Perplexity", color: "hsl(270 76% 55%)" },
                { key: "gemini", label: "Gemini", color: "hsl(217 91% 60%)" },
                { key: "grok", label: "Grok", color: "hsl(0 0% 45%)" },
              ]}
            />
          </ChartCard>
        </div>
        <div className="space-y-4">
          <ChartCard title="Simulation volume" description="How much testing happened each day.">
            <SimulationsVolumeChart data={volume} />
          </ChartCard>
          <ChartCard title="Engine mix" description="Where simulations ran in the last 90 days.">
            <EngineMixChart data={engineMix} />
          </ChartCard>
        </div>
      </div>

      {/* Prompts */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-5 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Search className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Prompts</h2>
                <p className="text-sm text-muted-foreground">
                  {keywords.length} search {keywords.length === 1 ? 'query' : 'queries'} to analyze
                </p>
              </div>
            </div>
            <Link href={`/brands/${brandId}/keyword-sets/${keywordSetId}/edit`}>
              <Button variant="outline" size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Add Prompt
              </Button>
            </Link>
          </div>
        </div>
        
        {keywords.length === 0 ? (
          <div className="p-10 text-center bg-muted/20">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-2">No prompts added yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Add the search queries you want to track across AI engines
            </p>
            <Link href={`/brands/${brandId}/keyword-sets/${keywordSetId}/edit`}>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Your First Prompt
              </Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {keywords.map((keyword: { id: string; text: string; last_checked_at?: string }, index: number) => {
              const k = perKeyword[keyword.id] || { total: 0, visible: 0, byEngine: {} };
              const vis = k.total > 0 ? Math.round((k.visible / k.total) * 100) : 0;
              const last = k.lastSeenAt || keyword.last_checked_at;
              
              const getVisibilityColor = (v: number) => {
                if (v >= 70) return "text-green-500 bg-green-500";
                if (v >= 40) return "text-yellow-500 bg-yellow-500";
                if (v > 0) return "text-red-500 bg-red-500";
                return "text-muted-foreground bg-muted";
              };
              const visColor = getVisibilityColor(vis);

              return (
                <div 
                  key={keyword.id} 
                  className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors group"
                >
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <span className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground flex-shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[15px] leading-snug">{keyword.text}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {last ? `Last analyzed ${new Date(last).toLocaleDateString()}` : "Not analyzed yet"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-5 flex-shrink-0">
                    {/* Visibility Score */}
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`text-lg font-bold tabular-nums ${visColor.split(' ')[0]}`}>{vis}%</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {k.visible}/{k.total} visible
                        </p>
                      </div>
                      <div className="w-2 h-10 rounded-full bg-muted overflow-hidden">
                        <div 
                          className={`w-full rounded-full transition-all ${visColor.split(' ')[1]}`}
                          style={{ height: `${Math.max(vis, 5)}%` }}
                        />
                      </div>
                    </div>
                    
                    <Link href={`/brands/${brandId}/compare?mode=keywords&a=${keyword.id}`}>
                      <Button variant="ghost" size="sm" className="gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <GitCompareArrows className="w-4 h-4" />
                        Compare
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Analysis History */}
      <div className="rounded-xl border border-border bg-card">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Analysis History</h2>
        </div>
        
        {!batches || batches.length === 0 ? (
          <div className="p-8 text-center">
            <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No analyses run yet</p>
            <RunAnalysisButton 
              brandId={brandId} 
              keywordSetId={keywordSetId}
              keywordsCount={keywords.length}
            />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {batches.map((batch) => {
              const config = statusConfig[batch.status] || statusConfig.queued;
              const progress = batch.total_simulations > 0
                ? Math.round((batch.completed_simulations / batch.total_simulations) * 100)
                : 0;

              return (
                <Link
                  key={batch.id}
                  href={`/brands/${brandId}/keyword-sets/${keywordSetId}/batches/${batch.id}`}
                  className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${config.bg}`}>
                      <span className={config.color}>{config.icon}</span>
                    </div>
                    <div>
                      <p className="font-medium">
                        {new Date(batch.created_at).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {batch.completed_simulations}/{batch.total_simulations} simulations
                        {Array.isArray(batch.engines) && batch.engines.length > 0 && ` • ${batch.engines.join(", ")}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {batch.status === 'processing' && (
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground">{progress}%</span>
                      </div>
                    )}
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                      {batch.status}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
