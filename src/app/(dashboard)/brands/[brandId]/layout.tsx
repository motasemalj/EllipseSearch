import { redirect, notFound } from "next/navigation";
import { getCurrentUser, getUserProfile } from "@/lib/cache";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Globe, ExternalLink, MapPin } from "lucide-react";
import { BrandFavicon } from "@/components/ui/brand-favicon";
import { BrandTabNavigation } from "@/components/brands/brand-tab-navigation";

interface BrandLayoutProps {
  children: React.ReactNode;
  params: { brandId: string };
}

async function getBrandInfo(brandId: string, organizationId: string) {
  const supabase = await createClient();
  
  const { data: brand } = await supabase
    .from("brands")
    .select("id, name, domain, primary_location")
    .eq("id", brandId)
    .eq("organization_id", organizationId)
    .single();
  
  if (!brand) return null;

  // Get prompt count for the brand
  const { count: promptCount } = await supabase
    .from("prompts")
    .select("*", { count: "exact", head: true })
    .eq("brand_id", brandId);
  
  return { ...brand, promptCount: promptCount || 0 };
}

export default async function BrandLayout({ children, params }: BrandLayoutProps) {
  const { brandId } = params;
  
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getUserProfile(user.id);
  if (!profile?.organization_id) redirect("/login");

  const brand = await getBrandInfo(brandId, profile.organization_id);
  if (!brand) notFound();

  return (
    <div className="min-h-full -mx-6 lg:-mx-8 -mt-6 lg:-mt-8">
      {/* Brand Header */}
      <div className="bg-card border-b border-border px-6 lg:px-8 py-5">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Link href="/brands">
              <Button variant="ghost" size="icon" className="shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            
            <BrandFavicon domain={brand.domain} size="lg" className="shrink-0" />
            
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold tracking-tight truncate">
                {brand.name}
              </h1>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                <a 
                  href={`https://${brand.domain}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {brand.domain}
                  <ExternalLink className="w-3 h-3" />
                </a>
                {brand.primary_location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {brand.primary_location}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Tab Navigation */}
      <BrandTabNavigation brandId={brandId} brandName={brand.name} promptCount={brand.promptCount} />
      
      {/* Page Content */}
      <div className="px-6 lg:px-8 py-6">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

