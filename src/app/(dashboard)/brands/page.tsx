import { redirect } from "next/navigation";
import { getCurrentUser, getUserProfile, getCachedBrands, getCachedSimulations } from "@/lib/cache";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Search, Filter, Grid } from "lucide-react";
import { BrandCard } from "@/components/dashboard/brand-card";
import { Input } from "@/components/ui/input";
import { Brand, SupportedEngine } from "@/types";

// Route segment config for caching
export const revalidate = 60;

async function getBrandsData(organizationId: string) {
  // Fetch brands and simulations in parallel
  const brands = await getCachedBrands(organizationId);
  const brandIds = brands.map(b => b.id);
  const simulations = await getCachedSimulations(brandIds);

  // Calculate visibility per brand per engine
  const brandVisibility: Record<string, { 
    overall: number; 
    byEngine: Partial<Record<SupportedEngine, { visible: number; total: number }>>; 
    count: number 
  }> = {};
  
  simulations.forEach(sim => {
    if (!brandVisibility[sim.brand_id]) {
      brandVisibility[sim.brand_id] = { overall: 0, byEngine: {}, count: 0 };
    }
    
    const engine = sim.engine as SupportedEngine;
    if (!brandVisibility[sim.brand_id].byEngine[engine]) {
      brandVisibility[sim.brand_id].byEngine[engine] = { visible: 0, total: 0 };
    }
    
    brandVisibility[sim.brand_id].count++;
    brandVisibility[sim.brand_id].byEngine[engine]!.total++;
    
    if (sim.is_visible) {
      brandVisibility[sim.brand_id].overall++;
      brandVisibility[sim.brand_id].byEngine[engine]!.visible++;
    }
  });

  return { brands, brandVisibility };
}

export default async function BrandsPage() {
  // Use cached user and profile - deduplicated with layout
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getUserProfile(user.id);
  if (!profile?.organization_id) redirect("/login");

  const { brands, brandVisibility } = await getBrandsData(profile.organization_id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Brands</h1>
          <p className="text-muted-foreground mt-1">
            Manage and monitor your client brands
          </p>
        </div>
        <Link href="/brands/new" prefetch={true}>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Add Brand
          </Button>
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search brands..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon">
            <Filter className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon">
            <Grid className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Brands Grid */}
      {brands.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {brands.map((brand) => {
            const vis = brandVisibility[brand.id];
            const visibilityData = vis ? {
              overall: vis.count > 0 ? Math.round((vis.overall / vis.count) * 100) : 0,
              byEngine: Object.fromEntries(
                Object.entries(vis.byEngine).map(([eng, stats]) => [
                  eng,
                  stats.total > 0 ? Math.round((stats.visible / stats.total) * 100) : 0
                ])
              ) as Partial<Record<SupportedEngine, number>>,
            } : undefined;

            return (
              <BrandCard
                key={brand.id}
                brand={brand as Brand}
                visibility={visibilityData}
                simulationsCount={vis?.count || 0}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
      <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Building2Icon className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No brands yet</h3>
      <p className="text-muted-foreground max-w-sm mx-auto mb-6">
        Add your first brand to start monitoring AI visibility and get actionable insights.
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

function Building2Icon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
    </svg>
  );
}
