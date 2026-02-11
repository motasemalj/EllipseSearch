import { redirect } from "next/navigation";
import { getCurrentUser, getUserProfile, getCachedBrands, getCachedSimulations } from "@/lib/cache";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Building2, Activity, BarChart3 } from "lucide-react";
import { Brand, SupportedEngine } from "@/types";
import { BrandsFilters } from "./brands-filters";

export const revalidate = 60;

async function getBrandsData(organizationId: string) {
  const brands = await getCachedBrands(organizationId);
  const brandIds = brands.map(b => b.id);
  const simulations = await getCachedSimulations(brandIds);

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

  // Calculate summary stats
  const totalBrands = brands.length;
  const totalSimulations = simulations.length;
  const totalVisible = simulations.filter(s => s.is_visible).length;
  const avgVisibility = totalSimulations > 0 
    ? Math.round((totalVisible / totalSimulations) * 100) 
    : 0;

  return { brands, brandVisibility, stats: { totalBrands, totalSimulations, avgVisibility } };
}

export default async function BrandsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getUserProfile(user.id);
  if (!profile?.organization_id) redirect("/login");

  const { brands, brandVisibility, stats } = await getBrandsData(profile.organization_id);

  const brandsWithVisibility = brands.map((brand) => {
    const vis = brandVisibility[brand.id];
    const visibilityData = vis ? {
      overall: vis.count > 0 ? Math.round((vis.overall / vis.count) * 100) : 0,
      byEngine: Object.fromEntries(
        Object.entries(vis.byEngine).map(([eng, stat]) => [
          eng,
          stat.total > 0 ? Math.round((stat.visible / stat.total) * 100) : 0
        ])
      ) as Partial<Record<SupportedEngine, number>>,
    } : undefined;

    return {
      brand: brand as Brand,
      visibility: visibilityData,
      simulationsCount: vis?.count || 0,
    };
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Brands</h1>
          <p className="page-description">
            Manage and monitor AI visibility for your brands
          </p>
        </div>
        <Link href="/brands/new" prefetch={true}>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Add Brand
          </Button>
        </Link>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="metric-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="data-label">Total Brands</p>
              <p className="text-2xl font-bold mt-0.5">{stats.totalBrands}</p>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-info/10">
              <Activity className="w-4 h-4 text-info" />
            </div>
            <div>
              <p className="data-label">Total Analyses</p>
              <p className="text-2xl font-bold mt-0.5">{stats.totalSimulations}</p>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <BarChart3 className="w-4 h-4 text-success" />
            </div>
            <div>
              <p className="data-label">Avg Visibility</p>
              <p className="text-2xl font-bold mt-0.5 text-success">{stats.avgVisibility}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Brands List */}
      {brands.length === 0 ? (
        <EmptyState />
      ) : (
        <BrandsFilters brands={brandsWithVisibility} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="enterprise-card">
      <div className="empty-state py-16">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-8 h-8 text-primary" />
        </div>
        <h3 className="empty-state-title">No brands yet</h3>
        <p className="empty-state-description">
          Add your first brand to start monitoring AI visibility and get actionable insights.
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
