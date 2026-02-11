import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandFavicon } from "@/components/ui/brand-favicon";
import { 
  Search, 
  Eye, 
  Building2, 
  Clock, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  ChevronRight,
  Filter,
  BarChart3,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const revalidate = 60;

interface PromptWithStats {
  id: string;
  text: string;
  brand_id: string;
  brand_name: string | undefined;
  brand_domain: string | undefined;
  set_name: string | undefined;
  total_sims: number;
  visible_sims: number;
  last_checked_at: string | null;
}

async function getPromptsData(organizationId: string) {
  const supabase = await createClient();

  const { data: prompts } = await supabase
    .from("prompts")
    .select(`
      id, 
      text, 
      prompt_set_id, 
      last_checked_at,
      brand_id,
      brands!inner(id, name, domain, organization_id),
      prompt_sets(name)
    `)
    .eq("brands.organization_id", organizationId)
    .order("created_at", { ascending: false });

  const { data: simulations } = await supabase
    .from("simulations")
    .select("prompt_id, is_visible")
    .in("prompt_id", prompts?.map(p => p.id) || []);

  const promptStats: Record<string, { total: number; visible: number }> = {};
  simulations?.forEach(sim => {
    if (!promptStats[sim.prompt_id]) promptStats[sim.prompt_id] = { total: 0, visible: 0 };
    promptStats[sim.prompt_id].total++;
    if (sim.is_visible) promptStats[sim.prompt_id].visible++;
  });

  const promptsWithStats: PromptWithStats[] = (prompts || []).map(p => {
    const brands = p.brands as unknown;
    const brandData = Array.isArray(brands) ? brands[0] as { name: string; domain: string } | undefined : brands as { name: string; domain: string } | null;
    const promptSets = p.prompt_sets as unknown;
    const setName = Array.isArray(promptSets) 
      ? (promptSets[0] as { name: string } | undefined)?.name 
      : (promptSets as { name: string } | null)?.name;
    
    return {
      id: p.id,
      text: p.text,
      brand_id: p.brand_id,
      brand_name: brandData?.name,
      brand_domain: brandData?.domain,
      set_name: setName,
      total_sims: promptStats[p.id]?.total || 0,
      visible_sims: promptStats[p.id]?.visible || 0,
      last_checked_at: p.last_checked_at,
    };
  });

  // Group by brand for statistics
  const brandStats: Record<string, { name: string; domain: string; prompts: number; visibility: number }> = {};
  promptsWithStats.forEach(p => {
    if (p.brand_name && p.brand_domain) {
      if (!brandStats[p.brand_id]) {
        brandStats[p.brand_id] = { name: p.brand_name, domain: p.brand_domain, prompts: 0, visibility: 0 };
      }
      brandStats[p.brand_id].prompts++;
      if (p.total_sims > 0) {
        brandStats[p.brand_id].visibility += (p.visible_sims / p.total_sims) * 100;
      }
    }
  });

  // Average visibility per brand
  Object.values(brandStats).forEach(b => {
    if (b.prompts > 0) {
      b.visibility = Math.round(b.visibility / b.prompts);
    }
  });

  return { promptsWithStats, brandStats };
}

export default async function PromptsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) redirect("/login");

  const { promptsWithStats, brandStats } = await getPromptsData(profile.organization_id);

  const getVisibilityColor = (v: number | null) => {
    if (v === null) return "bg-muted text-muted-foreground";
    if (v >= 70) return "text-success";
    if (v >= 40) return "text-warning";
    return "text-destructive";
  };

  const getVisibilityBgColor = (v: number | null) => {
    if (v === null) return "bg-muted";
    if (v >= 70) return "bg-success/10";
    if (v >= 40) return "bg-warning/10";
    return "bg-destructive/10";
  };

  const getVisibilityIcon = (v: number | null) => {
    if (v === null) return <Clock className="w-3.5 h-3.5" />;
    if (v >= 70) return <TrendingUp className="w-3.5 h-3.5" />;
    if (v >= 40) return <Minus className="w-3.5 h-3.5" />;
    return <TrendingDown className="w-3.5 h-3.5" />;
  };

  // Calculate summary stats
  const totalPrompts = promptsWithStats.length;
  const analyzedPrompts = promptsWithStats.filter(p => p.total_sims > 0).length;
  const avgVisibility = analyzedPrompts > 0
    ? Math.round(
        promptsWithStats
          .filter(p => p.total_sims > 0)
          .reduce((acc, p) => acc + (p.visible_sims / p.total_sims) * 100, 0) / analyzedPrompts
      )
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Prompts</h1>
          <p className="page-description">
            Manage and analyze prompts across all your brands
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="w-4 h-4" />
            Filter
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="metric-card">
          <p className="data-label">Total Prompts</p>
          <p className="metric-card-value mt-1">{totalPrompts}</p>
        </div>
        <div className="metric-card">
          <p className="data-label">Analyzed</p>
          <p className="metric-card-value mt-1">{analyzedPrompts}</p>
        </div>
        <div className="metric-card">
          <p className="data-label">Avg Visibility</p>
          <p className={cn("metric-card-value mt-1", getVisibilityColor(avgVisibility))}>
            {avgVisibility}%
          </p>
        </div>
        <div className="metric-card">
          <p className="data-label">Active Brands</p>
          <p className="metric-card-value mt-1">{Object.keys(brandStats).length}</p>
        </div>
      </div>

      {/* Brand Overview */}
      {Object.keys(brandStats).length > 0 && (
        <div className="enterprise-card">
          <div className="enterprise-card-header">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold">Prompts by Brand</h2>
            </div>
          </div>
          <div className="enterprise-card-body">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(brandStats).map(([brandId, stats]) => (
                <Link
                  key={brandId}
                  href={`/brands/${brandId}`}
                  className="flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary/30 hover:bg-muted/30 transition-all"
                >
                  <BrandFavicon domain={stats.domain} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{stats.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {stats.prompts} prompt{stats.prompts !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn("text-lg font-bold tabular-nums", getVisibilityColor(stats.visibility))}>
                      {stats.visibility}%
                    </p>
                    <p className="text-xs text-muted-foreground">visibility</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Prompts Table */}
      <div className="enterprise-card">
        <div className="enterprise-card-header flex items-center justify-between">
          <div>
            <h2 className="font-semibold">All Prompts</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Click to view detailed analysis
            </p>
          </div>
        </div>
        
        {promptsWithStats.length === 0 ? (
          <div className="empty-state py-16">
            <Search className="empty-state-icon w-12 h-12" />
            <h3 className="empty-state-title">No prompts yet</h3>
            <p className="empty-state-description">
              Add prompts to your brands to start tracking AI visibility
            </p>
            <Link href="/brands" className="mt-6 inline-block">
              <Button className="gap-2">
                <Building2 className="w-4 h-4" />
                Go to Brands
              </Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {promptsWithStats.map((prompt) => {
              const visibility = prompt.total_sims > 0 
                ? Math.round((prompt.visible_sims / prompt.total_sims) * 100) 
                : null;
              
              const hasAnalysis = prompt.total_sims > 0;
              const targetUrl = hasAnalysis 
                ? `/brands/${prompt.brand_id}/prompts/${prompt.id}`
                : `/brands/${prompt.brand_id}`;

              return (
                <Link
                  key={prompt.id}
                  href={targetUrl}
                  className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors"
                >
                  {/* Visibility Badge */}
                  <div className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold min-w-[80px] justify-center",
                    getVisibilityBgColor(visibility),
                    getVisibilityColor(visibility)
                  )}>
                    {getVisibilityIcon(visibility)}
                    {visibility !== null ? `${visibility}%` : "New"}
                  </div>
                  
                  {/* Brand Favicon */}
                  {prompt.brand_domain && (
                    <BrandFavicon domain={prompt.brand_domain} size="sm" />
                  )}
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium leading-snug truncate pr-4">
                      {prompt.text}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted">
                        <Building2 className="w-3 h-3" />
                        {prompt.brand_name}
                      </span>
                      {prompt.set_name && (
                        <span className="px-2 py-0.5 rounded bg-muted">
                          {prompt.set_name}
                        </span>
                      )}
                      {prompt.total_sims > 0 && (
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {prompt.visible_sims}/{prompt.total_sims} visible
                        </span>
                      )}
                      {prompt.last_checked_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(prompt.last_checked_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Run Analysis Button */}
                  {!hasAnalysis && (
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Play className="w-3.5 h-3.5" />
                      Analyze
                    </Button>
                  )}

                  {/* Chevron */}
                  <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
