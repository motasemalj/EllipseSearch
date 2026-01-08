import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandFavicon } from "@/components/ui/brand-favicon";
import { Search, Eye, Building2, Clock, TrendingUp, TrendingDown, Minus, ChevronRight } from "lucide-react";

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

  // Get all prompts across all brands for this organization
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
    .eq("brands.organization_id", profile.organization_id)
    .order("created_at", { ascending: false });

  // Get simulation stats per prompt
  const { data: simulations } = await supabase
    .from("simulations")
    .select("prompt_id, is_visible")
    .in("prompt_id", prompts?.map(p => p.id) || []);

  // Calculate stats
  const promptStats: Record<string, { total: number; visible: number }> = {};
  simulations?.forEach(sim => {
    if (!promptStats[sim.prompt_id]) promptStats[sim.prompt_id] = { total: 0, visible: 0 };
    promptStats[sim.prompt_id].total++;
    if (sim.is_visible) promptStats[sim.prompt_id].visible++;
  });

  const promptsWithStats = (prompts || []).map(p => {
    // Handle both array and object returns from Supabase join
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

  const getVisibilityColor = (v: number | null) => {
    if (v === null) return "bg-muted text-muted-foreground";
    if (v >= 70) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    if (v >= 40) return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    return "bg-red-500/10 text-red-600 dark:text-red-400";
  };

  const getVisibilityIcon = (v: number | null) => {
    if (v === null) return <Clock className="w-4 h-4" />;
    if (v >= 70) return <TrendingUp className="w-4 h-4" />;
    if (v >= 40) return <Minus className="w-4 h-4" />;
    return <TrendingDown className="w-4 h-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">All Prompts</h1>
          <p className="text-muted-foreground mt-1">
            {promptsWithStats.length} prompt{promptsWithStats.length !== 1 ? 's' : ''} across all brands • Click to view analysis
          </p>
        </div>
      </div>

      {/* Prompts List */}
      {promptsWithStats.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No prompts yet</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            Add prompts to your brands to start tracking AI visibility
          </p>
          <Link href="/brands">
            <Button className="gap-2">
              <Building2 className="w-4 h-4" />
              Go to Brands
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
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
                className="group flex items-center gap-4 p-4 rounded-xl border bg-card border-border hover:border-primary/40 hover:bg-primary/5 hover:shadow-md transition-all"
              >
                {/* Visibility Badge */}
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold min-w-[80px] justify-center ${getVisibilityColor(visibility)}`}>
                  {getVisibilityIcon(visibility)}
                  {visibility !== null ? `${visibility}%` : "New"}
                </div>
                
                {/* Brand Favicon */}
                {prompt.brand_domain && (
                  <BrandFavicon domain={prompt.brand_domain} size="sm" />
                )}
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium leading-snug truncate pr-4">{prompt.text}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted border border-border">
                      <Building2 className="w-3 h-3" />
                      {prompt.brand_name}
                    </span>
                    {prompt.set_name && (
                      <span className="px-2 py-0.5 rounded-full bg-muted border border-border">
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

                {/* Chevron */}
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

