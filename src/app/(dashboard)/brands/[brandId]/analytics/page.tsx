"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ChartCard } from "@/components/charts/chart-card";
import { VisibilityTrendChart } from "@/components/charts/visibility-trend";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  MessageSquare,
  ChevronRight,
  Eye,
  EyeOff,
  Search,
  Clock,
  Grid3X3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SupportedEngine } from "@/types";
import { ChatGPTIcon, PerplexityIcon, GeminiIcon, GrokIcon } from "@/components/ui/engine-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EngineMetrics {
  engine: SupportedEngine;
  visibility: number;
  trend: number;
  totalAnalyses: number;
  avgSentiment: string;
}

interface PromptAnalytics {
  id: string;
  text: string;
  totalAnalyses: number;
  visibleAnalyses: number;
  visibility: number;
  lastAnalyzedAt: string | null;
  engineBreakdown: Record<SupportedEngine, { visible: number; total: number }>;
}

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

export default function AnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const brandId = params.brandId as string;
  
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("30d");
  const [engineMetrics, setEngineMetrics] = useState<EngineMetrics[]>([]);
  const [trendData, setTrendData] = useState<Array<{ date: string; [key: string]: number | string }>>([]);
  const [overallMetrics, setOverallMetrics] = useState({
    visibility: 0,
    visibilityTrend: 0,
    totalAnalyses: 0,
    analysesTrend: 0,
    avgResponseTime: 0,
  });
  const [promptAnalytics, setPromptAnalytics] = useState<PromptAnalytics[]>([]);
  const [promptSearchQuery, setPromptSearchQuery] = useState("");

  useEffect(() => {
    async function fetchAnalytics() {
      setIsLoading(true);
      const supabase = createClient();
      
      // Calculate date range
      const now = new Date();
      const daysBack = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - daysBack);
      
      // Fetch simulations with prompt info
      const { data: simulations } = await supabase
        .from("simulations")
        .select("id, engine, is_visible, sentiment, created_at, prompt_id")
        .eq("brand_id", brandId)
        .eq("status", "completed")
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true });

      // Fetch prompts
      const { data: prompts } = await supabase
        .from("prompts")
        .select("id, text, created_at")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });

      if (!simulations || simulations.length === 0) {
        // Still set prompts even if no simulations
        if (prompts) {
          setPromptAnalytics(prompts.map(p => ({
            id: p.id,
            text: p.text,
            totalAnalyses: 0,
            visibleAnalyses: 0,
            visibility: 0,
            lastAnalyzedAt: null,
            engineBreakdown: {
              chatgpt: { visible: 0, total: 0 },
              perplexity: { visible: 0, total: 0 },
              gemini: { visible: 0, total: 0 },
              grok: { visible: 0, total: 0 },
            },
          })));
        }
        setIsLoading(false);
        return;
      }

      // Calculate engine metrics
      const engines: SupportedEngine[] = ["chatgpt", "perplexity", "gemini", "grok"];
      const engineData: Record<SupportedEngine, { visible: number; total: number; sentiments: string[] }> = {
        chatgpt: { visible: 0, total: 0, sentiments: [] },
        perplexity: { visible: 0, total: 0, sentiments: [] },
        gemini: { visible: 0, total: 0, sentiments: [] },
        grok: { visible: 0, total: 0, sentiments: [] },
      };

      // Group by date for trend
      const dateGroups: Record<string, Record<string, { visible: number; total: number }>> = {};

      // Track per-prompt analytics
      const promptMap = new Map<string, {
        visible: number;
        total: number;
        lastAnalyzedAt: string;
        engineBreakdown: Record<SupportedEngine, { visible: number; total: number }>;
      }>();

      simulations.forEach(sim => {
        const engine = sim.engine as SupportedEngine;
        engineData[engine].total++;
        if (sim.is_visible) engineData[engine].visible++;
        if (sim.sentiment) engineData[engine].sentiments.push(sim.sentiment);

        const date = new Date(sim.created_at).toISOString().split('T')[0];
        if (!dateGroups[date]) {
          dateGroups[date] = {
            overall: { visible: 0, total: 0 },
            chatgpt: { visible: 0, total: 0 },
            perplexity: { visible: 0, total: 0 },
            gemini: { visible: 0, total: 0 },
            grok: { visible: 0, total: 0 },
          };
        }
        dateGroups[date][engine].total++;
        dateGroups[date].overall.total++;
        if (sim.is_visible) {
          dateGroups[date][engine].visible++;
          dateGroups[date].overall.visible++;
        }

        // Track per-prompt data
        if (sim.prompt_id) {
          const existing = promptMap.get(sim.prompt_id);
          if (existing) {
            existing.total++;
            if (sim.is_visible) existing.visible++;
            if (sim.created_at > existing.lastAnalyzedAt) {
              existing.lastAnalyzedAt = sim.created_at;
            }
            existing.engineBreakdown[engine].total++;
            if (sim.is_visible) existing.engineBreakdown[engine].visible++;
          } else {
            promptMap.set(sim.prompt_id, {
              visible: sim.is_visible ? 1 : 0,
              total: 1,
              lastAnalyzedAt: sim.created_at,
              engineBreakdown: {
                chatgpt: { visible: 0, total: 0 },
                perplexity: { visible: 0, total: 0 },
                gemini: { visible: 0, total: 0 },
                grok: { visible: 0, total: 0 },
                [engine]: { visible: sim.is_visible ? 1 : 0, total: 1 },
              },
            });
          }
        }
      });

      // Build prompt analytics
      if (prompts) {
        const analytics: PromptAnalytics[] = prompts.map(p => {
          const data = promptMap.get(p.id);
          return {
            id: p.id,
            text: p.text,
            totalAnalyses: data?.total || 0,
            visibleAnalyses: data?.visible || 0,
            visibility: data && data.total > 0 ? Math.round((data.visible / data.total) * 100) : 0,
            lastAnalyzedAt: data?.lastAnalyzedAt || null,
            engineBreakdown: data?.engineBreakdown || {
              chatgpt: { visible: 0, total: 0 },
              perplexity: { visible: 0, total: 0 },
              gemini: { visible: 0, total: 0 },
              grok: { visible: 0, total: 0 },
            },
          };
        });
        setPromptAnalytics(analytics);
      }

      // Calculate metrics for each engine
      const metrics = engines.map(engine => {
        const data = engineData[engine];
        const visibility = data.total > 0 ? Math.round((data.visible / data.total) * 100) : 0;
        const avgSentiment = data.sentiments.length > 0 
          ? data.sentiments.filter(s => s === 'positive').length > data.sentiments.length / 2 
            ? 'positive' 
            : data.sentiments.filter(s => s === 'negative').length > data.sentiments.length / 2
            ? 'negative'
            : 'neutral'
          : 'neutral';
        
        return {
          engine,
          visibility,
          trend: 0, // Would need historical comparison
          totalAnalyses: data.total,
          avgSentiment,
        };
      });

      setEngineMetrics(metrics);

      // Build trend data
      const trend = Object.entries(dateGroups)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          date,
          overall: data.overall.total > 0 ? Math.round((data.overall.visible / data.overall.total) * 100) : 0,
          chatgpt: data.chatgpt.total > 0 ? Math.round((data.chatgpt.visible / data.chatgpt.total) * 100) : 0,
          perplexity: data.perplexity.total > 0 ? Math.round((data.perplexity.visible / data.perplexity.total) * 100) : 0,
          gemini: data.gemini.total > 0 ? Math.round((data.gemini.visible / data.gemini.total) * 100) : 0,
          grok: data.grok.total > 0 ? Math.round((data.grok.visible / data.grok.total) * 100) : 0,
        }));

      setTrendData(trend);

      // Overall metrics
      const totalVisible = simulations.filter(s => s.is_visible).length;
      const overallVisibility = simulations.length > 0 
        ? Math.round((totalVisible / simulations.length) * 100) 
        : 0;

      setOverallMetrics({
        visibility: overallVisibility,
        visibilityTrend: 0,
        totalAnalyses: simulations.length,
        analysesTrend: 0,
        avgResponseTime: 0,
      });

      setIsLoading(false);
    }

    fetchAnalytics();
  }, [brandId, timeRange]);

  const filteredPrompts = promptAnalytics.filter(p =>
    p.text.toLowerCase().includes(promptSearchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with Time Range Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Detailed visibility metrics and trends
          </p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-32">
            <Calendar className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="metric-card">
          <p className="data-label">Overall Visibility</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="metric-card-value text-primary">{overallMetrics.visibility}%</p>
            {overallMetrics.visibilityTrend !== 0 && (
              <span className={cn(
                "flex items-center text-xs font-medium",
                overallMetrics.visibilityTrend > 0 ? "text-success" : "text-destructive"
              )}>
                {overallMetrics.visibilityTrend > 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                )}
                {Math.abs(overallMetrics.visibilityTrend)}%
              </span>
            )}
          </div>
        </div>
        <div className="metric-card">
          <p className="data-label">Total Analyses</p>
          <p className="metric-card-value mt-1">{overallMetrics.totalAnalyses}</p>
        </div>
        <div className="metric-card">
          <p className="data-label">Best Performing</p>
          <div className="flex items-center gap-2 mt-2">
            {engineMetrics.length > 0 && (
              <>
                {engineIcons[engineMetrics.sort((a, b) => b.visibility - a.visibility)[0].engine]}
                <span className="font-medium">
                  {engineNames[engineMetrics.sort((a, b) => b.visibility - a.visibility)[0].engine]}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="metric-card">
          <p className="data-label">Tracked Prompts</p>
          <p className="metric-card-value mt-1">{promptAnalytics.length}</p>
        </div>
      </div>

      {/* Visibility Trend Chart */}
      <ChartCard
        title="Visibility Trend"
        description={`Daily visibility rate over the last ${timeRange === "7d" ? "7" : timeRange === "30d" ? "30" : "90"} days`}
      >
        <VisibilityTrendChart
          data={trendData}
          series={[
            { key: "overall", label: "Overall", color: "hsl(var(--primary))" },
            { key: "chatgpt", label: "ChatGPT", color: "hsl(var(--engine-chatgpt))" },
            { key: "perplexity", label: "Perplexity", color: "hsl(var(--engine-perplexity))" },
            { key: "gemini", label: "Gemini", color: "hsl(var(--engine-gemini))" },
            { key: "grok", label: "Grok", color: "hsl(var(--engine-grok))" },
          ]}
        />
      </ChartCard>

      {/* Prompt Performance */}
      <div className="enterprise-card">
        <div className="enterprise-card-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold">Prompt Performance</h3>
              <Badge variant="secondary">{promptAnalytics.length}</Badge>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search prompts..."
                value={promptSearchQuery}
                onChange={(e) => setPromptSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
        </div>
        
        {filteredPrompts.length === 0 ? (
          <div className="empty-state py-12">
            <MessageSquare className="empty-state-icon" />
            <h3 className="empty-state-title">No prompts found</h3>
            <p className="empty-state-description">
              Add prompts to start tracking visibility
            </p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => router.push(`/brands/${brandId}/prompts`)}
            >
              Add Prompts
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredPrompts.map((prompt) => (
              <button
                key={prompt.id}
                className="w-full p-4 flex items-start gap-4 hover:bg-muted/30 transition-colors text-left group"
                onClick={() => router.push(`/brands/${brandId}/prompts/${prompt.id}`)}
              >
                <div className={cn(
                  "p-2 rounded-lg mt-0.5",
                  prompt.visibility >= 50 ? "bg-success/10" : "bg-muted"
                )}>
                  {prompt.visibility >= 50 ? (
                    <Eye className="w-4 h-4 text-success" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
                    {prompt.text}
                  </p>
                  
                  {/* Engine Breakdown */}
                  <div className="flex items-center gap-4 mt-3">
                    {(["chatgpt", "perplexity", "gemini", "grok"] as SupportedEngine[]).map((engine) => {
                      const data = prompt.engineBreakdown[engine];
                      const engineVis = data.total > 0 ? Math.round((data.visible / data.total) * 100) : null;
                      
                      return (
                        <div key={engine} className="flex items-center gap-1.5">
                          <div className={cn(
                            "p-1 rounded",
                            data.total > 0 ? "bg-muted" : "bg-muted/50"
                          )}>
                            {engineIcons[engine]}
                          </div>
                          {engineVis !== null ? (
                            <span className={cn(
                              "text-xs font-medium tabular-nums",
                              engineVis >= 50 ? "text-success" : 
                              engineVis >= 25 ? "text-warning" : "text-muted-foreground"
                            )}>
                              {engineVis}%
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Meta info */}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>{prompt.totalAnalyses} analyses</span>
                    {prompt.lastAnalyzedAt && (
                      <>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Last analyzed {new Date(prompt.lastAnalyzedAt).toLocaleDateString()}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className={cn(
                      "text-xl font-bold tabular-nums",
                      prompt.visibility >= 50 ? "text-success" :
                      prompt.visibility >= 25 ? "text-warning" : "text-muted-foreground"
                    )}>
                      {prompt.visibility}%
                    </p>
                    <p className="text-xs text-muted-foreground">visibility</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results Matrix (All Prompts × Engines) */}
      <div className="enterprise-card">
        <div className="enterprise-card-header">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold">Results Matrix</h3>
              <Badge variant="secondary">{filteredPrompts.length}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Visibility per prompt per engine (based on the selected time range)
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th className="min-w-[360px]">Prompt</th>
                {(["chatgpt", "perplexity", "gemini", "grok"] as SupportedEngine[]).map((engine) => (
                  <th key={engine} className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      {engineIcons[engine]}
                      <span>{engineNames[engine]}</span>
                    </div>
                  </th>
                ))}
                <th className="text-right">Overall</th>
              </tr>
            </thead>
            <tbody>
              {filteredPrompts.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => router.push(`/brands/${brandId}/prompts/${p.id}`)}>
                  <td>
                    <div className="max-w-[520px]">
                      <p className="font-medium text-sm line-clamp-2">{p.text}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {p.totalAnalyses} analyses{p.lastAnalyzedAt ? ` • Last: ${new Date(p.lastAnalyzedAt).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                  </td>
                  {(["chatgpt", "perplexity", "gemini", "grok"] as SupportedEngine[]).map((engine) => {
                    const d = p.engineBreakdown[engine];
                    const pct = d.total > 0 ? Math.round((d.visible / d.total) * 100) : null;
                    const color =
                      pct === null ? "text-muted-foreground" :
                      pct >= 70 ? "text-success" :
                      pct >= 40 ? "text-warning" :
                      pct > 0 ? "text-destructive" :
                      "text-muted-foreground";
                    return (
                      <td key={engine} className="text-center">
                        {pct === null ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : (
                          <div className="inline-flex flex-col items-center">
                            <span className={cn("text-sm font-semibold tabular-nums", color)}>{pct}%</span>
                            <span className="text-[11px] text-muted-foreground tabular-nums">{d.visible}/{d.total}</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="text-right">
                    <span className={cn(
                      "text-sm font-semibold tabular-nums",
                      p.visibility >= 70 ? "text-success" : p.visibility >= 40 ? "text-warning" : p.visibility > 0 ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {p.visibility}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Engine Breakdown Table */}
      <div className="enterprise-card">
        <div className="enterprise-card-header">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold">Engine Performance</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Engine</th>
                <th>Visibility</th>
                <th>Trend</th>
                <th className="text-right">Total Analyses</th>
                <th>Sentiment</th>
              </tr>
            </thead>
            <tbody>
              {engineMetrics.map((metric) => (
                <tr key={metric.engine}>
                  <td>
                    <div className="flex items-center gap-2">
                      {engineIcons[metric.engine]}
                      <span className="font-medium">{engineNames[metric.engine]}</span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            metric.visibility >= 70 ? "bg-success" :
                            metric.visibility >= 40 ? "bg-warning" : "bg-destructive"
                          )}
                          style={{ width: `${metric.visibility}%` }}
                        />
                      </div>
                      <span className={cn(
                        "font-semibold tabular-nums",
                        metric.visibility >= 70 ? "text-success" :
                        metric.visibility >= 40 ? "text-warning" : "text-destructive"
                      )}>
                        {metric.visibility}%
                      </span>
                    </div>
                  </td>
                  <td>
                    {metric.trend !== 0 ? (
                      <span className={cn(
                        "flex items-center gap-1 text-sm font-medium",
                        metric.trend > 0 ? "text-success" : "text-destructive"
                      )}>
                        {metric.trend > 0 ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                        {Math.abs(metric.trend)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="text-right font-medium tabular-nums">
                    {metric.totalAnalyses}
                  </td>
                  <td>
                    <span className={cn(
                      "status-badge",
                      metric.avgSentiment === "positive" ? "success" :
                      metric.avgSentiment === "negative" ? "error" : "neutral"
                    )}>
                      {metric.avgSentiment}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
