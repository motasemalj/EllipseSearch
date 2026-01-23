"use client";

import { useState } from "react";
import { 
  ExternalLink, 
  Award, 
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Globe,
  Building,
  Users,
  MessageSquare,
  FileText,
  Newspaper,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CitationAuthority, StandardizedSource } from "@/types";

interface CitationAuthorityPanelProps {
  sources: StandardizedSource[] | CitationAuthority[];
  brandDomain: string;
  brandName?: string;
  isBrandVisible?: boolean; // Whether brand was mentioned in the AI response
  maxDisplay?: number;
}

// Helper to normalize source properties across StandardizedSource and CitationAuthority
type NormalizedSource = {
  url?: string;
  domain: string;
  snippet?: string;
  authority_score: number;
  tier: string;
  source_type?: string;
  is_brand_match: boolean;
};

function normalizeSource(s: StandardizedSource | CitationAuthority, brandDomain: string): NormalizedSource {
  const tier = 'tier' in s ? s.tier : ('authority_tier' in s ? s.authority_tier : undefined);
  
  // Enhanced brand domain matching
  const sourceDomain = (s.domain || '').toLowerCase().replace(/^www\./, '');
  const cleanBrandDomain = brandDomain.toLowerCase().replace(/^www\./, '');
  
  // Extract core brand name from domain (e.g., "damac" from "damac.com" or "damac.ae")
  const brandCore = cleanBrandDomain.split('.')[0];
  const sourceCore = sourceDomain.split('.')[0];
  
  const isBrandMatch = 
    ('is_brand_match' in s && s.is_brand_match) || 
    ('is_brand_domain' in s && s.is_brand_domain) ||
    sourceDomain === cleanBrandDomain ||  // Exact match
    sourceDomain.includes(cleanBrandDomain) ||  // Source contains brand
    cleanBrandDomain.includes(sourceDomain) ||  // Brand contains source
    sourceCore === brandCore ||  // Core names match
    (brandCore.length > 3 && sourceDomain.includes(brandCore)) ||  // Core brand name in source
    (sourceCore.length > 3 && cleanBrandDomain.includes(sourceCore));  // Core source in brand
  
  return {
    url: 'url' in s ? s.url : undefined,
    domain: s.domain,
    snippet: 'snippet' in s ? s.snippet : undefined,
    authority_score: s.authority_score || 0,
    tier: tier || 'unknown',
    source_type: s.source_type,
    is_brand_match: !!isBrandMatch,
  };
}

export function CitationAuthorityPanel({
  sources,
  brandDomain,
  brandName,
  isBrandVisible = false,
  maxDisplay = 8,
}: CitationAuthorityPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!sources || sources.length === 0) {
    return null;
  }

  // Normalize all sources
  const normalizedSources = sources.map(s => normalizeSource(s, brandDomain));

  // Sort by authority score
  const sortedSources = [...normalizedSources].sort((a, b) => 
    b.authority_score - a.authority_score
  );
  
  const displaySources = expanded ? sortedSources : sortedSources.slice(0, maxDisplay);
  
  // Count brand matches
  const brandMatchCount = normalizedSources.filter(s => s.is_brand_match).length;
  
  // Calculate average authority
  const avgAuthority = Math.round(
    normalizedSources.reduce((sum, s) => sum + s.authority_score, 0) / normalizedSources.length
  );

  const getTierConfig = (tier?: string) => {
    switch (tier) {
      case "authoritative":
        return { color: "text-green-500", bg: "bg-green-500/20", label: "Authoritative" };
      case "high":
        return { color: "text-blue-500", bg: "bg-blue-500/20", label: "High" };
      case "medium":
        return { color: "text-yellow-500", bg: "bg-yellow-500/20", label: "Medium" };
      case "low":
        return { color: "text-red-500", bg: "bg-red-500/20", label: "Low" };
      default:
        return { color: "text-muted-foreground", bg: "bg-muted", label: "Unknown" };
    }
  };

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case "editorial": return FileText;
      case "directory": return Building;
      case "social": return Users;
      case "blog": return MessageSquare;
      case "official": return Award;
      case "forum": return MessageSquare;
      case "news": return Newspaper;
      default: return Globe;
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header with summary stats */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/20">
              <Award className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Citation Authority Map</h3>
              <p className="text-sm text-muted-foreground">
                {sources.length} sources analyzed
              </p>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-xl bg-muted/30">
            <p className={`text-2xl font-bold ${
              avgAuthority >= 70 ? "text-green-500" :
              avgAuthority >= 50 ? "text-yellow-500" :
              "text-red-500"
            }`}>{avgAuthority}</p>
            <p className="text-xs text-muted-foreground">Avg. Authority</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-muted/30">
            <p className="text-2xl font-bold text-primary">{brandMatchCount}</p>
            <p className="text-xs text-muted-foreground">Brand Citations</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-muted/30">
            <p className="text-2xl font-bold">
              {sortedSources.filter(s => s.tier === "authoritative" || s.tier === "high").length}
            </p>
            <p className="text-xs text-muted-foreground">High-Authority</p>
          </div>
        </div>
      </div>

      {/* Source list */}
      <div className="divide-y divide-border">
        {displaySources.map((source, i) => {
          const tierConfig = getTierConfig(source.tier);
          const TypeIcon = getTypeIcon(source.source_type);
          
          return (
            <div 
              key={i} 
              className={`p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors ${
                source.is_brand_match ? "bg-primary/5" : ""
              }`}
            >
              {/* Rank */}
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground shrink-0">
                {i + 1}
              </div>

              {/* Source info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium truncate">
                    {source.domain}
                  </span>
                  {source.is_brand_match && (
                    <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-xs font-medium shrink-0">
                      Your Domain
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${tierConfig.bg} ${tierConfig.color}`}>
                    <Star className="w-3 h-3" />
                    {tierConfig.label}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground capitalize">
                    <TypeIcon className="w-3 h-3" />
                    {source.source_type || "Other"}
                  </span>
                </div>
                {(source as StandardizedSource).snippet && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                    {(source as StandardizedSource).snippet}
                  </p>
                )}
              </div>

              {/* Authority score */}
              <div className="text-right shrink-0">
                <p className={`text-lg font-bold ${tierConfig.color}`}>
                  {source.authority_score || 0}
                </p>
                <p className="text-xs text-muted-foreground">Authority</p>
              </div>

              {/* Link */}
              {'url' in source && source.url && (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg hover:bg-muted transition-colors shrink-0"
                >
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* Expand/collapse */}
      {sources.length > maxDisplay && (
        <div className="p-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="w-full gap-2"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Show {sources.length - maxDisplay} More Sources
              </>
            )}
          </Button>
        </div>
      )}

      {/* Contextual recommendation based on visibility and citation status */}
      {brandMatchCount === 0 && (
        <div className={`p-4 border-t border-border ${isBrandVisible ? 'bg-blue-500/5' : 'bg-amber-500/5'}`}>
          <div className="flex items-start gap-2">
            <AlertCircle className={`w-4 h-4 mt-0.5 shrink-0 ${isBrandVisible ? 'text-blue-500' : 'text-amber-500'}`} />
            <p className={`text-sm ${isBrandVisible ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {isBrandVisible ? (
                <>
                  <span className="font-medium">{brandName || 'Your brand'} was mentioned but not directly cited.</span>{" "}
                  The AI referenced your brand in its response, but didn&apos;t link to your website as a source.
                  {sortedSources.length > 0 && (
                    <> Target getting cited alongside {sortedSources.slice(0, 2).map(s => s.domain).join(" and ")}.</>
                  )}
                </>
              ) : (
                <>
                  <span className="font-medium">Your brand was not cited in sources.</span>{" "}
                  {sortedSources.length > 0 && (
                    <>Focus on getting featured in high-authority sources like {sortedSources.slice(0, 2).map(s => s.domain).join(", ")}.</>
                  )}
                </>
              )}
            </p>
          </div>
        </div>
      )}
      
      {/* Positive message if brand IS cited */}
      {brandMatchCount > 0 && (
        <div className="p-4 border-t border-border bg-emerald-500/5">
          <div className="flex items-start gap-2">
            <Award className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              <span className="font-medium">{brandName || 'Your brand'} was cited {brandMatchCount} time{brandMatchCount > 1 ? 's' : ''}!</span>{" "}
              The AI is referencing your website as a source.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

