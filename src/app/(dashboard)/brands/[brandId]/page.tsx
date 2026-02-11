import { redirect, notFound } from "next/navigation";
import { getCurrentUser, getUserProfile } from "@/lib/cache";
import { getBrandPageData } from "@/lib/data";
import { SupportedEngine } from "@/types";
import { VisibilityGauge } from "@/components/ui/visibility-gauge";
import { ChartCard } from "@/components/charts/chart-card";
import { VisibilityTrendChart } from "@/components/charts/visibility-trend";
import { SimulationsVolumeChart } from "@/components/charts/simulations-volume";
import { MarketShareChart } from "@/components/charts/market-share";
import { ChatGPTIcon, PerplexityIcon, GeminiIcon, GrokIcon } from "@/components/ui/engine-badge";
import { 
  Activity,
  Eye,
  BarChart3,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const revalidate = 60;

interface BrandPageProps {
  params: { brandId: string };
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

export default async function BrandPage({ params }: BrandPageProps) {
  const { brandId } = params;
  
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getUserProfile(user.id);
  if (!profile?.organization_id) redirect("/login");

  const data = await getBrandPageData(brandId, profile.organization_id);
  if (!data) notFound();

  const { brand, stats, charts, autoAnalysisStatus } = data;
  const engines: SupportedEngine[] = ["chatgpt", "perplexity", "gemini", "grok"];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Overall Visibility */}
        <div className="metric-card col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="data-label">Overall Visibility</p>
              <p className="metric-card-value text-primary mt-1">
                {stats.overallVisibility}%
              </p>
            </div>
            <VisibilityGauge value={stats.overallVisibility} size="sm" showLabel={false} />
          </div>
        </div>

        {/* Total Analyses */}
        <div className="metric-card">
          <p className="data-label">Total Analyses</p>
          <p className="metric-card-value mt-1">{stats.totalSimulations}</p>
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <Activity className="w-3.5 h-3.5" />
            <span>All time</span>
          </div>
        </div>

        {/* Visible Responses */}
        <div className="metric-card">
          <p className="data-label">Visible Responses</p>
          <p className="metric-card-value text-success mt-1">{stats.visibleSimulations}</p>
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <Eye className="w-3.5 h-3.5" />
            <span>{stats.totalSimulations > 0 ? Math.round((stats.visibleSimulations / stats.totalSimulations) * 100) : 0}% rate</span>
          </div>
        </div>

        {/* Analysis Status */}
        <div className="metric-card">
          <p className="data-label">Analysis Status</p>
          <p className={cn(
            "text-lg font-semibold mt-1",
            autoAnalysisStatus.enabled ? "text-success" : "text-muted-foreground"
          )}>
            {autoAnalysisStatus.enabled ? "Active" : "Paused"}
          </p>
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            <span>{autoAnalysisStatus.enabled ? (autoAnalysisStatus.frequency || "3x daily") : "Not scheduled"}</span>
          </div>
        </div>
      </div>

      {/* Engine Performance Grid */}
      <div className="enterprise-card">
        <div className="enterprise-card-header">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold">Engine Performance</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Visibility breakdown across AI search engines
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {engines.map((engine, index) => {
            const stat = stats.engineStats[engine];
            const visibility = stat.total > 0 
              ? Math.round((stat.visible / stat.total) * 100) 
              : 0;
            
            return (
              <div 
                key={engine} 
                className={cn(
                  "p-5",
                  // Add borders between items
                  index < engines.length - 1 && "border-r border-border",
                  index < 2 && "lg:border-b-0 border-b border-border"
                )}
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className={cn(
                    "p-1.5 rounded",
                    `engine-${engine}`
                  )} style={{ background: `hsl(var(--engine-${engine}) / 0.1)` }}>
                    {engineIcons[engine]}
                  </div>
                  <span className="font-medium text-sm">{engineNames[engine]}</span>
                </div>
                
                <div className="space-y-3">
                  <div className="text-center">
                    <span className={cn(
                      "text-3xl font-bold tabular-nums",
                      visibility >= 70 ? "text-success" : visibility >= 40 ? "text-warning" : stat.total === 0 ? "text-muted-foreground" : "text-destructive"
                    )}>
                      {stat.total > 0 ? `${visibility}%` : "—"}
                    </span>
                    <div className="mt-3 progress-bar h-2">
                      <div 
                        className={cn(
                          "progress-bar-fill h-full",
                          visibility >= 70 ? "bg-success" : visibility >= 40 ? "bg-warning" : "bg-destructive"
                        )}
                        style={{ width: `${visibility}%` }}
                      />
                    </div>
                  </div>
                  
                  <div className="flex justify-between text-xs text-muted-foreground pt-1">
                    <span>{stat.visible} visible</span>
                    <span>{stat.total} total</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Visibility Trend"
          description="90-day visibility across all engines"
        >
          <VisibilityTrendChart
            data={charts.trend}
            series={[
              { key: "overall", label: "Overall", color: "hsl(var(--primary))" },
              { key: "chatgpt", label: "ChatGPT", color: "hsl(var(--engine-chatgpt))" },
              { key: "perplexity", label: "Perplexity", color: "hsl(var(--engine-perplexity))" },
              { key: "gemini", label: "Gemini", color: "hsl(var(--engine-gemini))" },
              { key: "grok", label: "Grok", color: "hsl(var(--engine-grok))" },
            ]}
          />
        </ChartCard>
        
        <ChartCard title="Analysis Activity" description="Daily analysis volume">
          <SimulationsVolumeChart data={charts.volume} />
        </ChartCard>
      </div>

      {/* Market Share & Selection Signals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Market Share" description="Your brand mentions vs competitors">
          <MarketShareChart data={stats.marketShare} brandName={brand.name} />
        </ChartCard>
        
        <ChartCard title="Selection Signals" description="Average optimization scores">
          <div className="p-4 space-y-4">
            {/* Structure Score */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Content Structure</span>
                <span className="font-medium tabular-nums">
                  {Math.round((
                    (stats.engineStats.chatgpt.avgScores.structure +
                    stats.engineStats.perplexity.avgScores.structure +
                    stats.engineStats.gemini.avgScores.structure +
                    stats.engineStats.grok.avgScores.structure) / 4
                  ) * 20)}%
                </span>
              </div>
              <div className="score-bar">
                <div 
                  className="score-bar-fill bg-primary" 
                  style={{ 
                    width: `${Math.round((
                      (stats.engineStats.chatgpt.avgScores.structure +
                      stats.engineStats.perplexity.avgScores.structure +
                      stats.engineStats.gemini.avgScores.structure +
                      stats.engineStats.grok.avgScores.structure) / 4
                    ) * 20)}%` 
                  }}
                />
              </div>
            </div>

            {/* Data Density */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Data Density</span>
                <span className="font-medium tabular-nums">
                  {Math.round((
                    (stats.engineStats.chatgpt.avgScores.dataDensity +
                    stats.engineStats.perplexity.avgScores.dataDensity +
                    stats.engineStats.gemini.avgScores.dataDensity +
                    stats.engineStats.grok.avgScores.dataDensity) / 4
                  ) * 20)}%
                </span>
              </div>
              <div className="score-bar">
                <div 
                  className="score-bar-fill bg-accent" 
                  style={{ 
                    width: `${Math.round((
                      (stats.engineStats.chatgpt.avgScores.dataDensity +
                      stats.engineStats.perplexity.avgScores.dataDensity +
                      stats.engineStats.gemini.avgScores.dataDensity +
                      stats.engineStats.grok.avgScores.dataDensity) / 4
                    ) * 20)}%` 
                  }}
                />
              </div>
            </div>

            {/* Directness */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Answer Directness</span>
                <span className="font-medium tabular-nums">
                  {Math.round((
                    (stats.engineStats.chatgpt.avgScores.directness +
                    stats.engineStats.perplexity.avgScores.directness +
                    stats.engineStats.gemini.avgScores.directness +
                    stats.engineStats.grok.avgScores.directness) / 4
                  ) * 20)}%
                </span>
              </div>
              <div className="score-bar">
                <div 
                  className="score-bar-fill bg-info" 
                  style={{ 
                    width: `${Math.round((
                      (stats.engineStats.chatgpt.avgScores.directness +
                      stats.engineStats.perplexity.avgScores.directness +
                      stats.engineStats.gemini.avgScores.directness +
                      stats.engineStats.grok.avgScores.directness) / 4
                    ) * 20)}%` 
                  }}
                />
              </div>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Top Sources */}
      {stats.topSourcesDetailed.length > 0 && (
        <div className="enterprise-card">
          <div className="enterprise-card-header">
            <h2 className="font-semibold">Top Citation Sources</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Domains most frequently cited in AI responses
            </p>
          </div>
          <div className="enterprise-card-body">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.topSourcesDetailed.slice(0, 6).map((source, index) => (
                <div 
                  key={source.domain}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                >
                  <span className="text-lg font-bold text-muted-foreground w-6">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{source.domain}</p>
                    <p className="text-xs text-muted-foreground">
                      {source.citations} citation{source.citations !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      {source.urls.length} URL{source.urls.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
