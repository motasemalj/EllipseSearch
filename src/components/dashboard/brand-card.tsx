"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Brand, SupportedEngine } from "@/types";
import { VisibilityGauge } from "@/components/ui/visibility-gauge";
import { EngineBadge } from "@/components/ui/engine-badge";
import { BrandFavicon } from "@/components/ui/brand-favicon";
import { Globe, MapPin, ArrowRight, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BrandCardProps {
  brand: Brand;
  visibility?: {
    overall: number;
    byEngine: Partial<Record<SupportedEngine, number>>;
  };
  simulationsCount?: number;
  className?: string;
}

// Memoized engine badges list
const EngineBadgesList = memo(function EngineBadgesList({
  byEngine,
}: {
  byEngine: Partial<Record<SupportedEngine, number>>;
}) {
  const entries = useMemo(() => 
    (Object.entries(byEngine) as [SupportedEngine, number][])
      .filter(([, v]) => v !== undefined),
    [byEngine]
  );

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {entries.map(([engine, vis]) => (
        <EngineBadge 
          key={engine} 
          engine={engine} 
          visibility={vis}
          size="sm"
        />
      ))}
    </div>
  );
});

export const BrandCard = memo(function BrandCard({ 
  brand, 
  visibility, 
  simulationsCount, 
  className 
}: BrandCardProps) {
  const overallVisibility = visibility?.overall ?? 0;
  
  // Memoize languages display
  const languagesDisplay = useMemo(() => {
    if (!brand.languages || brand.languages.length === 0) return null;
    return brand.languages.map(l => l.toUpperCase()).join(", ");
  }, [brand.languages]);

  return (
    <div className={cn(
      "group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-300",
      "hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5",
      className
    )}>
      {/* Background gradient effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <BrandFavicon domain={brand.domain} size="md" />
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold truncate group-hover:text-primary transition-colors">
                {brand.name}
              </h3>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5" />
                  {brand.domain}
                </span>
                {brand.primary_location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {brand.primary_location}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Visibility Gauge */}
          <VisibilityGauge 
            value={overallVisibility} 
            size="sm" 
            label="AI Visibility"
          />
        </div>

        {/* Engine breakdown */}
        {visibility?.byEngine && Object.keys(visibility.byEngine).length > 0 && (
          <EngineBadgesList byEngine={visibility.byEngine} />
        )}

        {/* Stats row */}
        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {simulationsCount !== undefined && (
              <span className="flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4" />
                <span className="tabular-nums">{simulationsCount}</span> analyses
              </span>
            )}
            {languagesDisplay && (
              <span className="px-2 py-0.5 rounded-full bg-muted/50 text-xs">
                {languagesDisplay}
              </span>
            )}
          </div>
          
          <Link href={`/brands/${brand.id}`} prefetch={true}>
            <Button variant="ghost" size="sm" className="gap-1 group/btn">
              View
              <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
});

export const BrandCardSkeleton = memo(function BrandCardSkeleton({ 
  className 
}: { 
  className?: string 
}) {
  return (
    <div className={cn(
      "rounded-2xl border border-border bg-card p-6 animate-pulse",
      className
    )}>
      <div className="flex items-start justify-between mb-4">
        <div className="space-y-2">
          <div className="h-5 w-32 bg-muted rounded" />
          <div className="h-4 w-48 bg-muted/50 rounded" />
        </div>
        <div className="w-20 h-12 bg-muted rounded" />
      </div>
      <div className="flex gap-2 mb-4">
        <div className="h-6 w-24 bg-muted/50 rounded-full" />
        <div className="h-6 w-24 bg-muted/50 rounded-full" />
      </div>
      <div className="pt-4 border-t border-border/50 flex justify-between">
        <div className="h-4 w-24 bg-muted/50 rounded" />
        <div className="h-8 w-16 bg-muted rounded" />
      </div>
    </div>
  );
});
