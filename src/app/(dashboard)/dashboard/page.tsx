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
} from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { BrandCard } from "@/components/dashboard/brand-card";
import { EngineCard } from "@/components/ui/engine-badge";
import { Brand, SupportedEngine } from "@/types";
import { ChartCard } from "@/components/charts/chart-card";
import { VisibilityTrendChart } from "@/components/charts/visibility-trend";
import { SimulationsVolumeChart } from "@/components/charts/simulations-volume";
import { EngineMixChart } from "@/components/charts/engine-mix";

// Route segment config for caching
export const revalidate = 60; // Revalidate every 60 seconds

export default async function DashboardPage() {
  // Use cached user - deduplicated with layout
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Use cached profile - deduplicated with layout
  const profile = await getUserProfile(user.id);
  if (!profile?.organization_id) {
    redirect("/login");
  }

  // Get dashboard data with caching
  const data = await getDashboardData(profile.organization_id);

  const engineVisibilities = Object.entries(data.stats.engineStats).map(([engine, stats]) => ({
    engine: engine as SupportedEngine,
    visibility: stats.total > 0 ? Math.round((stats.visible / stats.total) * 100) : 0,
  }));

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Track your AI visibility across all engines
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Overall AI Visibility"
          value={`${data.stats.overallVisibility}%`}
          subtitle="Across all engines"
          icon={<Eye className="w-5 h-5" />}
          variant="gradient"
          trend={5}
          trendLabel="vs last month"
        />
        <MetricCard
          title="Total Brands"
          value={data.stats.totalBrands}
          subtitle="Being monitored"
          icon={<Building2Icon className="w-5 h-5" />}
        />
        <MetricCard
          title="Analyses Run"
          value={data.stats.totalSimulations}
          subtitle="Total simulations"
          icon={<Search className="w-5 h-5" />}
        />
        <MetricCard
          title="Active Engines"
          value={engineVisibilities.length}
          subtitle="ChatGPT, Gemini, Grok, Perplexity"
          icon={<Bot className="w-5 h-5" />}
        />
      </div>

      {/* Engine Visibility Grid */}
      {engineVisibilities.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Visibility by Engine</h2>
            <Link href="/brands" prefetch={true} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              View details
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {engineVisibilities.map(({ engine, visibility }) => (
              <EngineCard key={engine} engine={engine} visibility={visibility} />
            ))}
          </div>
        </div>
      )}

      {/* Insights - Clean 2x2 Grid */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Insights</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartCard
            title="Visibility Trend"
            description="90-day visibility across all engines"
          >
            <VisibilityTrendChart
              data={data.charts.trend}
              series={[
                { key: "overall", label: "Overall", color: "hsl(var(--primary))" },
                { key: "chatgpt", label: "ChatGPT", color: "hsl(160 84% 39%)" },
                { key: "perplexity", label: "Perplexity", color: "hsl(270 76% 55%)" },
                { key: "gemini", label: "Gemini", color: "hsl(217 91% 60%)" },
                { key: "grok", label: "Grok", color: "hsl(0 0% 45%)" },
              ]}
            />
          </ChartCard>
          <ChartCard title="Simulation Volume" description="Daily analysis activity">
            <SimulationsVolumeChart data={data.charts.volume} />
          </ChartCard>
          <ChartCard title="Engine Distribution" description="Where your simulations ran">
            <EngineMixChart data={data.charts.engineMix} />
          </ChartCard>
          <ChartCard title="Performance Summary" description="Key metrics at a glance">
            <div className="h-[200px] flex flex-col justify-center">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 rounded-xl bg-muted/30">
                  <p className="text-3xl font-bold text-primary">{data.stats.overallVisibility}%</p>
                  <p className="text-sm text-muted-foreground mt-1">Avg Visibility</p>
                </div>
                <div className="text-center p-4 rounded-xl bg-muted/30">
                  <p className="text-3xl font-bold">{data.stats.totalSimulations}</p>
                  <p className="text-sm text-muted-foreground mt-1">Total Analyses</p>
                </div>
                <div className="text-center p-4 rounded-xl bg-muted/30">
                  <p className="text-3xl font-bold">{data.stats.totalBrands}</p>
                  <p className="text-sm text-muted-foreground mt-1">Brands Tracked</p>
                </div>
                <div className="text-center p-4 rounded-xl bg-muted/30">
                  <p className="text-3xl font-bold">{engineVisibilities.length}</p>
                  <p className="text-sm text-muted-foreground mt-1">Active Engines</p>
                </div>
              </div>
            </div>
          </ChartCard>
        </div>
      </div>

      {/* Brands Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Your Brands</h2>
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
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Recent Analyses</h2>
            <Link
              href="/brands"
              prefetch={true}
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="divide-y divide-border">
              {data.recentBatches.map((batch) => (
                <RecentBatchRow key={batch.id} batch={batch} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Building2Icon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
      <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Sparkles className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Get started with AI Visibility</h3>
      <p className="text-muted-foreground max-w-sm mx-auto mb-6">
        Add your first brand to start tracking how AI search engines talk about your clients.
      </p>
      <Link href="/brands/new" prefetch={true}>
        <Button size="lg" className="gap-2">
          <Plus className="w-4 h-4" />
          Add Your First Brand
        </Button>
      </Link>
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
    completed: "bg-green-500/10 text-green-500",
    processing: "bg-blue-500/10 text-blue-500",
    queued: "bg-yellow-500/10 text-yellow-500",
    failed: "bg-red-500/10 text-red-500",
  };

  const progress =
    batch.total_simulations > 0
      ? Math.round((batch.completed_simulations / batch.total_simulations) * 100)
      : 0;

  return (
    <Link 
      href={`/brands/${batch.brand_id}/keyword-sets/${batch.keyword_set_id}/batches/${batch.id}`}
      prefetch={true}
      className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Activity className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="font-medium">{batch.brands?.name || "Unknown Brand"}</p>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              {new Date(batch.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
            <span className="text-muted-foreground/50">•</span>
            <span>
              {batch.completed_simulations}/{batch.total_simulations} simulations
            </span>
            {batch.status === "processing" && (
              <>
                <span className="text-muted-foreground/50">•</span>
                <span className="tabular-nums">{progress}%</span>
              </>
            )}
          </div>
          {batch.status === "processing" && (
            <div className="mt-2 h-2 w-56 max-w-full rounded-full bg-muted/40 overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[batch.status] || statusColors.queued}`}>
          {batch.status}
        </span>
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </Link>
  );
}
