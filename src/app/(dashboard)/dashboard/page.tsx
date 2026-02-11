import { redirect } from "next/navigation";
import { getCurrentUser, getUserProfile } from "@/lib/cache";
import { getDashboardData, getBrandVisibilityData } from "@/lib/data";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  Plus, 
  Eye,
  Search,
  ArrowRight,
  Sparkles,
  Bot,
  Activity,
  Building2,
  BarChart3,
} from "lucide-react";
import { BrandCard } from "@/components/dashboard/brand-card";
import { Brand, SupportedEngine } from "@/types";
import { ChartCard } from "@/components/charts/chart-card";
import { VisibilityTrendChart } from "@/components/charts/visibility-trend";
import { SimulationsVolumeChart } from "@/components/charts/simulations-volume";
import { ChatGPTIcon, PerplexityIcon, GeminiIcon, GrokIcon } from "@/components/ui/engine-badge";
import { cn } from "@/lib/utils";

export const revalidate = 60;

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

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getUserProfile(user.id);
  if (!profile?.organization_id) {
    redirect("/login");
  }

  const data = await getDashboardData(profile.organization_id);

  const engineVisibilities = Object.entries(data.stats.engineStats).map(([engine, stats]) => ({
    engine: engine as SupportedEngine,
    visibility: stats.total > 0 ? Math.round((stats.visible / stats.total) * 100) : 0,
    total: stats.total,
    visible: stats.visible,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-description">
            Overview of your AI visibility across all engines
          </p>
        </div>
        <Link href="/brands/new" prefetch={true}>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Add Brand
          </Button>
        </Link>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="metric-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Eye className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="data-label">Overall Visibility</p>
              <p className="text-2xl font-bold text-primary mt-0.5">{data.stats.overallVisibility}%</p>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-info/10">
              <Building2 className="w-4 h-4 text-info" />
            </div>
            <div>
              <p className="data-label">Total Brands</p>
              <p className="text-2xl font-bold mt-0.5">{data.stats.totalBrands}</p>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <Search className="w-4 h-4 text-accent" />
            </div>
            <div>
              <p className="data-label">Analyses Run</p>
              <p className="text-2xl font-bold mt-0.5">{data.stats.totalSimulations}</p>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <Bot className="w-4 h-4 text-success" />
            </div>
            <div>
              <p className="data-label">Active Engines</p>
              <p className="text-2xl font-bold mt-0.5">{engineVisibilities.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Engine Performance */}
      {engineVisibilities.length > 0 && (
        <div className="enterprise-card">
          <div className="enterprise-card-header">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold">Engine Performance</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border">
            {engineVisibilities.map(({ engine, visibility, total, visible }) => (
              <div key={engine} className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn("p-1.5 rounded")} style={{ background: `hsl(var(--engine-${engine}) / 0.1)` }}>
                    {engineIcons[engine]}
                  </div>
                  <span className="font-medium text-sm">{engineNames[engine]}</span>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className={cn(
                      "text-2xl font-bold tabular-nums",
                      visibility >= 70 ? "text-success" : visibility >= 40 ? "text-warning" : "text-destructive"
                    )}>
                      {visibility}%
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div 
                      className={cn(
                        "progress-bar-fill",
                        visibility >= 70 ? "bg-success" : visibility >= 40 ? "bg-warning" : "bg-destructive"
                      )}
                      style={{ width: `${visibility}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{visible} visible</span>
                    <span>{total} total</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Visibility Trend"
          description="90-day visibility across all engines"
        >
          <VisibilityTrendChart
            data={data.charts.trend}
            series={[
              { key: "overall", label: "Overall", color: "hsl(var(--primary))" },
              { key: "chatgpt", label: "ChatGPT", color: "hsl(var(--engine-chatgpt))" },
              { key: "perplexity", label: "Perplexity", color: "hsl(var(--engine-perplexity))" },
              { key: "gemini", label: "Gemini", color: "hsl(var(--engine-gemini))" },
              { key: "grok", label: "Grok", color: "hsl(var(--engine-grok))" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Analysis Volume" description="Daily analysis activity">
          <SimulationsVolumeChart data={data.charts.volume} />
        </ChartCard>
      </div>

      {/* Brands Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Brands</h2>
          {data.brands.length > 0 && (
            <Link href="/brands" prefetch={true} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              View all
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        {data.brands.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.brands.slice(0, 4).map((brand) => {
              const visibilityData = getBrandVisibilityData(
                data.brandVisibility,
                brand.id,
                data.stats.engineStats
              );

              return (
                <BrandCard
                  key={brand.id}
                  brand={brand as Brand}
                  visibility={visibilityData}
                  simulationsCount={data.brandVisibility[brand.id]?.count || 0}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      {data.recentBatches.length > 0 && (
        <div className="enterprise-card">
          <div className="enterprise-card-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold">Recent Analyses</h2>
            </div>
            <Link
              href="/brands"
              prefetch={true}
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {data.recentBatches.map((batch) => (
              <RecentBatchRow key={batch.id} batch={batch} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="enterprise-card">
      <div className="empty-state py-16">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h3 className="empty-state-title">Get started with AI Visibility</h3>
        <p className="empty-state-description">
          Add your first brand to start tracking how AI search engines talk about your clients.
        </p>
        <Link href="/brands/new" prefetch={true} className="mt-6 inline-block">
          <Button size="lg" className="gap-2">
            <Plus className="w-4 h-4" />
            Add Your First Brand
          </Button>
        </Link>
      </div>
    </div>
  );
}

interface RecentBatchRowProps {
  batch: {
    id: string;
    status: string;
    completed_simulations: number;
    total_simulations: number;
    created_at: string;
    brands?: { name: string } | null;
    brand_id: string;
    keyword_set_id: string;
  };
}

function RecentBatchRow({ batch }: RecentBatchRowProps) {
  const statusColors: Record<string, string> = {
    completed: "success",
    processing: "info",
    queued: "warning",
    failed: "error",
  };

  const progress =
    batch.total_simulations > 0
      ? Math.round((batch.completed_simulations / batch.total_simulations) * 100)
      : 0;

  return (
    <Link 
      href={`/brands/${batch.brand_id}/keyword-sets/${batch.keyword_set_id}/batches/${batch.id}`}
      prefetch={true}
      className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
          <Activity className="w-4 h-4 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium text-sm">{batch.brands?.name || "Unknown Brand"}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>
              {new Date(batch.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
            <span>•</span>
            <span>
              {batch.completed_simulations}/{batch.total_simulations} analyses
            </span>
            {batch.status === "processing" && (
              <>
                <span>•</span>
                <span className="tabular-nums">{progress}%</span>
              </>
            )}
          </div>
          {batch.status === "processing" && (
            <div className="mt-2 progress-bar w-48">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={cn("status-badge", statusColors[batch.status] || "neutral")}>
          {batch.status}
        </span>
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </Link>
  );
}
