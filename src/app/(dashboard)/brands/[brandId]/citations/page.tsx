"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CitationsPageSkeleton } from "@/components/loading/dashboard-skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Link2,
  ExternalLink,
  Search,
  Globe,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SupportedEngine } from "@/types";
import { ChatGPTIcon, PerplexityIcon, GeminiIcon, GrokIcon } from "@/components/ui/engine-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CitationSource {
  domain: string;
  citations: number;
  urls: string[];
  engines: SupportedEngine[];
  isBrandDomain: boolean;
  firstSeen: string;
  lastSeen: string;
}

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

export default function CitationsPage() {
  const params = useParams();
  const brandId = params.brandId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterEngine, setFilterEngine] = useState<string>("all");
  const [sources, setSources] = useState<CitationSource[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [brandDomain, setBrandDomain] = useState<string>("");
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());

  function toggleExpanded(domain: string) {
    setExpandedDomains(prev => {
      const next = new Set(prev);
      if (next.has(domain)) {
        next.delete(domain);
      } else {
        next.add(domain);
      }
      return next;
    });
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast.success("URL copied to clipboard");
  }

  useEffect(() => {
    fetchCitations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  async function fetchCitations() {
    setIsLoading(true);
    const supabase = createClient();

    // Get brand domain
    const { data: brand } = await supabase
      .from("brands")
      .select("domain")
      .eq("id", brandId)
      .single();

    if (brand) {
      setBrandDomain(brand.domain);
    }

    // Fetch simulations with selection_signals (same data source as overview page)
    const { data: simulations } = await supabase
      .from("simulations")
      .select("id, engine, selection_signals, created_at")
      .eq("brand_id", brandId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(500);

    if (!simulations || simulations.length === 0) {
      setIsLoading(false);
      return;
    }

    // Aggregate citations by domain - using the same logic as lib/data/brand.ts
    const domainMap = new Map<string, {
      citations: number;
      urls: Set<string>;
      engines: Set<SupportedEngine>;
      firstSeen: string;
      lastSeen: string;
    }>();

    for (const sim of simulations) {
      const engine = sim.engine as SupportedEngine;
      
      // Get winning_sources from selection_signals (same as overview page)
      const signals = sim.selection_signals as {
        winning_sources?: string[];
      } | null;
      
      const winningSources = signals?.winning_sources || [];
      
      for (const source of winningSources) {
        try {
          // Parse the URL to get the domain
          const url = new URL(source);
          const domain = url.hostname.replace(/^www\./, "");
          
          const existing = domainMap.get(domain);
          if (existing) {
            existing.citations++;
            existing.urls.add(source);
            existing.engines.add(engine);
            if (sim.created_at < existing.firstSeen) existing.firstSeen = sim.created_at;
            if (sim.created_at > existing.lastSeen) existing.lastSeen = sim.created_at;
          } else {
            domainMap.set(domain, {
              citations: 1,
              urls: new Set([source]),
              engines: new Set([engine]),
              firstSeen: sim.created_at,
              lastSeen: sim.created_at,
            });
          }
        } catch {
          // Invalid URL, try to extract domain directly
          const domain = source.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
          if (domain && domain.includes(".")) {
            const existing = domainMap.get(domain);
            if (existing) {
              existing.citations++;
              existing.engines.add(engine);
              if (sim.created_at < existing.firstSeen) existing.firstSeen = sim.created_at;
              if (sim.created_at > existing.lastSeen) existing.lastSeen = sim.created_at;
            } else {
              domainMap.set(domain, {
                citations: 1,
                urls: new Set(),
                engines: new Set([engine]),
                firstSeen: sim.created_at,
                lastSeen: sim.created_at,
              });
            }
          }
        }
      }
    }

    // Convert to array and sort by citations
    const cleanBrandDomain = brand?.domain?.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0] || "";
    
    const sourcesArray: CitationSource[] = Array.from(domainMap.entries())
      .map(([domain, data]) => ({
        domain,
        citations: data.citations,
        urls: Array.from(data.urls).slice(0, 10),
        engines: Array.from(data.engines),
        isBrandDomain: cleanBrandDomain ? domain.includes(cleanBrandDomain) || cleanBrandDomain.includes(domain) : false,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
      }))
      .sort((a, b) => b.citations - a.citations);

    setSources(sourcesArray);
    setIsLoading(false);
  }

  const filteredSources = sources.filter((source) => {
    const matchesSearch = source.domain.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesEngine = filterEngine === "all" || source.engines.includes(filterEngine as SupportedEngine);
    return matchesSearch && matchesEngine;
  });

  const totalCitations = sources.reduce((sum, s) => sum + s.citations, 0);
  const uniqueDomains = sources.length;
  const brandCitations = sources.find((s) => s.isBrandDomain)?.citations || 0;
  const brandShare = totalCitations > 0 ? Math.round((brandCitations / totalCitations) * 100) : 0;

  if (isLoading) {
    return <CitationsPageSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Citation Sources</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Track which domains are cited by AI engines when answering your tracked prompts
          </p>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="metric-card">
          <p className="data-label">Total Citations</p>
          <p className="metric-card-value mt-1">{totalCitations}</p>
        </div>
        <div className="metric-card">
          <p className="data-label">Unique Domains</p>
          <p className="metric-card-value mt-1">{uniqueDomains}</p>
        </div>
        <div className="metric-card">
          <p className="data-label">Your Domain Citations</p>
          <p className={cn(
            "metric-card-value mt-1",
            brandCitations > 0 ? "text-success" : "text-muted-foreground"
          )}>
            {brandCitations}
          </p>
        </div>
        <div className="metric-card">
          <p className="data-label">Your Citation Share</p>
          <p className={cn(
            "metric-card-value mt-1",
            brandShare >= 10 ? "text-success" : brandShare >= 5 ? "text-warning" : "text-muted-foreground"
          )}>
            {brandShare}%
          </p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search domains..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterEngine} onValueChange={setFilterEngine}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Engines" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Engines</SelectItem>
            <SelectItem value="chatgpt">ChatGPT</SelectItem>
            <SelectItem value="perplexity">Perplexity</SelectItem>
            <SelectItem value="gemini">Gemini</SelectItem>
            <SelectItem value="grok">Grok</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {filteredSources.length} sources
        </p>
      </div>

      {/* Citations List */}
      {filteredSources.length === 0 ? (
        <div className="enterprise-card">
          <div className="enterprise-card-body py-12 text-center">
            <Link2 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">No citations found</h3>
            <p className="text-muted-foreground text-sm">
              Run analyses on your prompts to see which sources AI engines cite
            </p>
          </div>
        </div>
      ) : (
        <div className="enterprise-card">
          <div className="enterprise-card-header">
            <h3 className="font-semibold">Top Citation Sources</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Ranked by number of times cited across all analyses
            </p>
          </div>
          <div className="divide-y divide-border">
            {filteredSources.map((source, index) => (
              <div
                key={source.domain}
                className={cn(
                  "p-4 transition-colors",
                  source.isBrandDomain && "bg-success/5"
                )}
              >
                <div className="flex items-start gap-4">
                  {/* Rank */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-sm font-bold text-muted-foreground">
                      {index + 1}
                    </span>
                  </div>

                  {/* Domain Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <a
                        href={`https://${source.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-sm hover:underline truncate"
                      >
                        {source.domain}
                      </a>
                      {source.isBrandDomain && (
                        <Badge variant="secondary" className="bg-success/10 text-success border-success/20 gap-1">
                          <Check className="w-3 h-3" />
                          Your Domain
                        </Badge>
                      )}
                      <a
                        href={`https://${source.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    
                    {/* Engine Breakdown */}
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">Cited by:</span>
                        <div className="flex items-center gap-1 ml-1">
                          {source.engines.map((engine) => (
                            <div
                              key={engine}
                              className="p-1 rounded bg-muted"
                              title={engineNames[engine]}
                            >
                              {engineIcons[engine]}
                            </div>
                          ))}
                        </div>
                      </div>
                      {source.urls.length > 0 && (
                        <>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">
                            {source.urls.length} unique URL{source.urls.length !== 1 ? "s" : ""}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Citation Count */}
                  <div className="text-right">
                    <p className="text-2xl font-bold tabular-nums">
                      {source.citations}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      citation{source.citations !== 1 ? "s" : ""}
                    </p>
                  </div>

                  {/* Citation Share Bar */}
                  <div className="w-24 flex-shrink-0">
                    <div className="text-right mb-1">
                      <span className="text-xs text-muted-foreground">
                        {Math.round((source.citations / totalCitations) * 100)}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          source.isBrandDomain ? "bg-success" : "bg-primary"
                        )}
                        style={{
                          width: `${Math.min(100, (source.citations / (filteredSources[0]?.citations || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Expandable URLs Section */}
                {source.urls.length > 0 && (
                  <div className="mt-3 pl-12">
                    {/* Toggle Button */}
                    <button
                      onClick={() => toggleExpanded(source.domain)}
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-2"
                    >
                      {expandedDomains.has(source.domain) ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                      <span>
                        {expandedDomains.has(source.domain) ? "Hide" : "Show"} {source.urls.length} URL{source.urls.length !== 1 ? "s" : ""}
                      </span>
                    </button>

                    {/* Collapsed View - Show first 2 URLs */}
                    {!expandedDomains.has(source.domain) && (
                      <div className="flex flex-wrap gap-2">
                        {source.urls.slice(0, 2).map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-foreground bg-muted px-2 py-1 rounded truncate max-w-sm"
                          >
                            {url.replace(/^https?:\/\//, "").slice(0, 60)}
                            {url.length > 60 ? "..." : ""}
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Expanded View - Show all URLs */}
                    {expandedDomains.has(source.domain) && (
                      <div className="space-y-2 bg-muted/30 rounded-lg p-3">
                        {source.urls.map((url, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 group"
                          >
                            <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground flex-shrink-0">
                              {i + 1}
                            </span>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 text-sm text-muted-foreground hover:text-foreground truncate"
                              title={url}
                            >
                              {url}
                            </a>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => copyUrl(url)}
                                className="p-1 hover:bg-muted rounded"
                                title="Copy URL"
                              >
                                <Copy className="w-3 h-3 text-muted-foreground" />
                              </button>
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 hover:bg-muted rounded"
                                title="Open in new tab"
                              >
                                <ExternalLink className="w-3 h-3 text-muted-foreground" />
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
