import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TrackPerformanceClient } from "./track-performance-client";

interface SimulationData {
  id: string;
  brand_id: string;
  engine: string;
  is_visible: boolean;
  created_at: string;
  selection_signals: unknown;
}

interface BrandData {
  id: string;
  name: string;
  domain: string;
}

async function getPerformanceData(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  organizationId: string
) {
  // Get brands
  const { data: brands } = await supabase
    .from("brands")
    .select("id, name, domain")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  const brandIds = brands?.map((b) => b.id) || [];
  
  // Get simulations for the last 90 days
  const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: simulations } = await supabase
    .from("simulations")
    .select("id, brand_id, engine, is_visible, created_at, selection_signals")
    .in("brand_id", brandIds)
    .gte("created_at", cutoff90)
    .order("created_at", { ascending: true });

  return {
    brands: brands || [],
    simulations: simulations || [],
  };
}

export default async function TrackPerformancePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) redirect("/login");

  const { brands, simulations } = await getPerformanceData(supabase, profile.organization_id);

  return (
    <TrackPerformanceClient 
      brands={brands as BrandData[]} 
      allSimulations={simulations as SimulationData[]} 
    />
  );
}
