import { redirect, notFound } from "next/navigation";
import { getCurrentUser, getUserProfile } from "@/lib/cache";
import { getBrandPageData } from "@/lib/data";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  Settings, 
  Globe, 
  MapPin,
  ExternalLink,
  GitCompareArrows,
  ListChecks,
  Search,
  Info,
  Plus,
} from "lucide-react";
import { StatRow } from "@/components/ui/metric-card";
import { VisibilityGauge } from "@/components/ui/visibility-gauge";
import { EngineCard, ChatGPTIcon, PerplexityIcon, GeminiIcon, GrokIcon } from "@/components/ui/engine-badge";
import { ScoreBar } from "@/components/ui/score-radar";
import { BrandFavicon } from "@/components/ui/brand-favicon";
import { SupportedEngine } from "@/types";
import { ChartCard } from "@/components/charts/chart-card";
import { VisibilityTrendChart } from "@/components/charts/visibility-trend";
import { SimulationsVolumeChart } from "@/components/charts/simulations-volume";
import { EngineMixChart } from "@/components/charts/engine-mix";
import { TopSourcesDrilldown } from "@/components/brands/top-sources-drilldown";
import { AddPromptDialog } from "@/components/brands/add-prompt-dialog";
import { BrandPromptsList } from "@/components/brands/brand-prompts-list";
import { AnalysisProgress } from "@/components/brands/analysis-progress";
import { CompletedAnalyses } from "@/components/brands/completed-analyses";

// Route segment config for caching
export const revalidate = 60;

interface BrandPageProps {
  params: { brandId: string };
}

export default async function BrandPage({ params }: BrandPageProps) {
  const { brandId } = params;
  
  // Use cached user - deduplicated with layout
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Use cached profile - deduplicated with layout
  const profile = await getUserProfile(user.id);
  if (!profile?.organization_id) redirect("/login");

  // Get brand data with caching and parallel fetching
  const data = await getBrandPageData(brandId, profile.organization_id);
  if (!data) notFound();

  const { brand, promptSets, promptsWithStats, stats, charts } = data;
  
  const engines: SupportedEngine[] = ["chatgpt", "perplexity", "gemini", "grok"];
  const engineIcons: Record<SupportedEngine, React.ReactNode> = {
    chatgpt: <ChatGPTIcon className="w-4 h-4" />,
    perplexity: <PerplexityIcon className="w-4 h-4" />,
    gemini: <GeminiIcon className="w-4 h-4" />,
    grok: <GrokIcon className="w-4 h-4" />,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Link href="/brands" prefetch={true}>
            <Button variant="ghost" size="icon" className="mt-1">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <BrandFavicon domain={brand.domain} size="lg" className="mt-1" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{brand.name}</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Globe className="w-4 h-4" />
                <a href={`https://${brand.domain}`} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                  {brand.domain}
                  <ExternalLink className="w-3 h-3 inline ml-1" />
                </a>
              </span>
              {brand.primary_location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  {brand.primary_location}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/brands/${brandId}/keyword-sets`} prefetch={true}>
            <Button variant="outline" className="gap-2">
              <ListChecks className="w-4 h-4" />
              Prompt Sets
            </Button>
          </Link>
          <Link href={`/brands/${brandId}/compare`} prefetch={true}>
            <Button variant="outline" className="gap-2">
              <GitCompareArrows className="w-4 h-4" />
              Compare
            </Button>
          </Link>
          <Link href={`/brands/${brandId}/edit`} prefetch={true}>
            <Button variant="outline" size="icon">
              <Settings className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Overview Cards - Visibility Gauge */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 rounded-2xl border border-border bg-card p-6 flex flex-col items-center justify-center">
          <VisibilityGauge value={stats.overallVisibility} size="lg" label="Overall AI Visibility" />
          <p className="text-sm text-muted-foreground mt-4 text-center">
            Your brand appears in <span className="font-semibold text-foreground">{stats.visibleSimulations}</span> of {stats.totalSimulations} AI responses
          </p>
        </div>
        
        <div className="md:col-span-2 grid grid-cols-2 gap-4">
          {engines.map(engine => {
            const stat = stats.engineStats[engine];
            const visibility = stat.total > 0 ? Math.round((stat.visible / stat.total) * 100) : 0;
            return (
              <EngineCard key={engine} engine={engine} visibility={visibility} />
            );
          })}
        </div>
      </div>

      {/* Prompts Section */}
      <div className="rounded-2xl border border-border bg-card">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-gradient-to-r from-muted/30 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Search className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Prompts</h2>
              <p className="text-sm text-muted-foreground">
                {promptsWithStats.length === 0 
                  ? "No prompts added yet" 
                  : `${promptsWithStats.length} prompt${promptsWithStats.length !== 1 ? 's' : ''} • Click to view analysis`
                }
              </p>
            </div>
          </div>
          <AddPromptDialog 
            brandId={brandId} 
            promptSets={promptSets}
            trigger={
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Prompt
              </Button>
            }
          />
        </div>
        
        {/* Content - Scrollable with max height */}
        <div className="p-4 max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          <BrandPromptsList brandId={brandId} prompts={promptsWithStats} />
        </div>
      </div>

      {/* Running Analyses Section */}
      <AnalysisProgress brandId={brandId} />

      {/* Recently Completed Analyses */}
      <CompletedAnalyses brandId={brandId} />

      {/* AI Accuracy Disclaimer */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
        <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-300">Results may vary</p>
          <p className="text-muted-foreground mt-0.5">
            AI search engines generate responses dynamically and results can change between queries. 
            Visibility scores are estimates based on simulated queries and may not reflect real-time user experiences. 
            Use these insights as directional guidance for your AI optimization strategy.
          </p>
        </div>
      </div>

      {/* Insights - Clean 2x2 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard
          title="Visibility Trend"
          description="90-day visibility across all engines"
        >
          <VisibilityTrendChart
            data={charts.trend}
            series={[
              { key: "overall", label: "Overall", color: "#F59E0B" },
              { key: "chatgpt", label: "ChatGPT", color: "#10B981" },
              { key: "perplexity", label: "Perplexity", color: "#8B5CF6" },
              { key: "gemini", label: "Gemini", color: "#3B82F6" },
              { key: "grok", label: "Grok", color: "#6B7280" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Simulation Volume" description="Daily analysis activity">
          <SimulationsVolumeChart data={charts.volume} />
        </ChartCard>
        <ChartCard title="Engine Distribution" description="Where your simulations ran">
          <EngineMixChart data={charts.engineMix} />
        </ChartCard>
        <ChartCard title="Performance Summary" description="Key metrics for this brand">
          <div className="h-[200px] flex flex-col justify-center">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 rounded-xl bg-muted/30">
                <p className="text-3xl font-bold text-primary">{stats.overallVisibility}%</p>
                <p className="text-sm text-muted-foreground mt-1">Visibility</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-muted/30">
                <p className="text-3xl font-bold">{stats.totalSimulations}</p>
                <p className="text-sm text-muted-foreground mt-1">Analyses</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-muted/30">
                <p className="text-3xl font-bold">{stats.visibleSimulations}</p>
                <p className="text-sm text-muted-foreground mt-1">Visible</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-muted/30">
                <p className="text-3xl font-bold">{promptSets.length}</p>
                <p className="text-sm text-muted-foreground mt-1">Prompt Sets</p>
              </div>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Engine Deep Dive Tabs */}
      <Tabs defaultValue="chatgpt" className="space-y-4">
        <TabsList className="bg-muted/50">
          {engines.map(engine => (
            <TabsTrigger key={engine} value={engine} className="gap-2 capitalize">
              {engineIcons[engine]}
              {engine === "chatgpt" ? "ChatGPT" : engine}
            </TabsTrigger>
          ))}
        </TabsList>

        {engines.map(engine => {
          const stat = stats.engineStats[engine];
          const visibility = stat.total > 0 ? Math.round((stat.visible / stat.total) * 100) : 0;
          
          return (
            <TabsContent key={engine} value={engine} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Visibility */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">Visibility on {engine === "chatgpt" ? "ChatGPT" : engine}</h3>
                  <div className="flex items-center gap-4">
                    <VisibilityGauge value={visibility} size="md" showLabel={false} />
                    <div>
                      <p className="text-3xl font-bold">{visibility}%</p>
                      <p className="text-sm text-muted-foreground">
                        {stat.visible}/{stat.total} responses
                      </p>
                    </div>
                  </div>
                </div>

                {/* Selection Signals */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">Selection Signals (Avg)</h3>
                  <div className="space-y-3">
                    <ScoreBar label="Structure" value={stat.avgScores.structure} />
                    <ScoreBar label="Data Density" value={stat.avgScores.dataDensity} />
                    <ScoreBar label="Directness" value={stat.avgScores.directness} />
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">Statistics</h3>
                  <div className="space-y-2">
                    <StatRow label="Total Analyses" value={stat.total} />
                    <StatRow label="Times Visible" value={stat.visible} />
                    <StatRow label="Not Visible" value={stat.total - stat.visible} />
                  </div>
                </div>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Top Winning Sources */}
      {stats.topSourcesDetailed.length > 0 && (
        <ChartCard
          title="Top winning sources"
          description="Click a domain to see the URLs being cited."
        >
          <TopSourcesDrilldown
            items={stats.topSourcesDetailed}
          />
        </ChartCard>
      )}

    </div>
  );
}
