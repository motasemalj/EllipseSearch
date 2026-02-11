"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Globe,
  ArrowUpDown,
  Filter,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { REGIONS, SupportedRegion, SupportedEngine } from "@/types";
import { ChatGPTIcon, PerplexityIcon, GeminiIcon, GrokIcon } from "@/components/ui/engine-badge";

interface RegionData {
  region: SupportedRegion;
  visibility: number;
  totalAnalyses: number;
  visibleAnalyses: number;
  lastAnalyzed: string | null;
  byEngine: Record<SupportedEngine, { visibility: number; total: number }>;
}

const engineIcons: Record<SupportedEngine, React.ReactNode> = {
  chatgpt: <ChatGPTIcon className="w-3.5 h-3.5" />,
  perplexity: <PerplexityIcon className="w-3.5 h-3.5" />,
  gemini: <GeminiIcon className="w-3.5 h-3.5" />,
  grok: <GrokIcon className="w-3.5 h-3.5" />,
};

const regionColors: Record<number, string> = {
  0: "hsl(var(--chart-1))",
  1: "hsl(var(--chart-2))",
  2: "hsl(var(--chart-3))",
  3: "hsl(var(--chart-4))",
  4: "hsl(var(--chart-5))",
  5: "hsl(var(--destructive))",
};

export default function RegionsPage() {
  const params = useParams();
  const brandId = params.brandId as string;
  
  const [regionData, setRegionData] = useState<RegionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"visibility" | "analyses">("visibility");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedRegions, setSelectedRegions] = useState<SupportedRegion[]>([]);

  useEffect(() => {
    async function fetchRegionData() {
      setIsLoading(true);
      const supabase = createClient();
      
      const { data: simulations } = await supabase
        .from("simulations")
        .select("id, is_visible, engine, region, created_at")
        .eq("brand_id", brandId)
        .eq("status", "completed");

      if (!simulations) {
        setIsLoading(false);
        return;
      }

      // Group by region
      const regionMap: Record<string, RegionData> = {};
      
      simulations.forEach((sim) => {
        const region = (sim.region || "global") as SupportedRegion;
        
        if (!regionMap[region]) {
          regionMap[region] = {
            region,
            visibility: 0,
            totalAnalyses: 0,
            visibleAnalyses: 0,
            lastAnalyzed: null,
            byEngine: {
              chatgpt: { visibility: 0, total: 0 },
              perplexity: { visibility: 0, total: 0 },
              gemini: { visibility: 0, total: 0 },
              grok: { visibility: 0, total: 0 },
            },
          };
        }
        
        const r = regionMap[region];
        r.totalAnalyses++;
        if (sim.is_visible) r.visibleAnalyses++;
        
        const engine = sim.engine as SupportedEngine;
        r.byEngine[engine].total++;
        if (sim.is_visible) r.byEngine[engine].visibility++;
        
        if (!r.lastAnalyzed || new Date(sim.created_at) > new Date(r.lastAnalyzed)) {
          r.lastAnalyzed = sim.created_at;
        }
      });

      // Calculate visibility percentages
      Object.values(regionMap).forEach((r) => {
        r.visibility = r.totalAnalyses > 0 
          ? Math.round((r.visibleAnalyses / r.totalAnalyses) * 100) 
          : 0;
        
        Object.entries(r.byEngine).forEach(([, stats]) => {
          if (stats.total > 0) {
            stats.visibility = Math.round((stats.visibility / stats.total) * 100);
          }
        });
      });

      const data = Object.values(regionMap);
      setRegionData(data);
      
      // Auto-select top 3 regions
      const sorted = [...data].sort((a, b) => b.totalAnalyses - a.totalAnalyses);
      setSelectedRegions(sorted.slice(0, 3).map((r) => r.region));
      
      setIsLoading(false);
    }
    
    fetchRegionData();
  }, [brandId]);

  const sortedData = [...regionData].sort((a, b) => {
    const aVal = sortBy === "visibility" ? a.visibility : a.totalAnalyses;
    const bVal = sortBy === "visibility" ? b.visibility : b.totalAnalyses;
    return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
  });

  const toggleSort = (field: "visibility" | "analyses") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const toggleRegionSelection = (region: SupportedRegion) => {
    setSelectedRegions((prev) =>
      prev.includes(region)
        ? prev.filter((r) => r !== region)
        : [...prev, region]
    );
  };

  const getRegionInfo = (region: SupportedRegion) => {
    return REGIONS.find((r) => r.id === region) || REGIONS[0];
  };

  const selectedData = sortedData.filter((r) => selectedRegions.includes(r.region));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (regionData.length === 0) {
    return (
      <div className="empty-state">
        <Globe className="empty-state-icon" />
        <h3 className="empty-state-title">No Regional Data</h3>
        <p className="empty-state-description">
          Run analyses with regional targeting to see performance comparison across markets.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Regional Performance</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Compare visibility across {regionData.length} region{regionData.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="w-3.5 h-3.5" />
            Filter
          </Button>
        </div>
      </div>

      {/* Comparison Bar Chart */}
      {selectedData.length > 0 && (
        <div className="enterprise-card">
          <div className="enterprise-card-header">
            <h3 className="font-semibold">Visibility Comparison</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Select regions below to compare
            </p>
          </div>
          <div className="enterprise-card-body">
            <div className="space-y-4">
              {selectedData.map((data, index) => {
                const regionInfo = getRegionInfo(data.region);
                const color = regionColors[index % 6];
                
                return (
                  <div key={data.region} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{regionInfo.flag}</span>
                        <span className="font-medium">{regionInfo.name}</span>
                      </div>
                      <span className="text-xl font-bold tabular-nums" style={{ color }}>
                        {data.visibility}%
                      </span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${data.visibility}%`, background: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Engine Breakdown for Selected Regions */}
      {selectedData.length > 0 && (
        <div className="enterprise-card">
          <div className="enterprise-card-header">
            <h3 className="font-semibold">Engine Performance by Region</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Region</th>
                  <th className="text-center">ChatGPT</th>
                  <th className="text-center">Perplexity</th>
                  <th className="text-center">Gemini</th>
                  <th className="text-center">Grok</th>
                  <th className="text-right">Total Analyses</th>
                </tr>
              </thead>
              <tbody>
                {selectedData.map((data, index) => {
                  const regionInfo = getRegionInfo(data.region);
                  const color = regionColors[index % 6];
                  
                  return (
                    <tr key={data.region}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ background: color }}
                          />
                          <span className="text-lg">{regionInfo.flag}</span>
                          <span className="font-medium">{regionInfo.name}</span>
                        </div>
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {engineIcons.chatgpt}
                          <span className="font-medium tabular-nums">
                            {data.byEngine.chatgpt.visibility}%
                          </span>
                        </div>
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {engineIcons.perplexity}
                          <span className="font-medium tabular-nums">
                            {data.byEngine.perplexity.visibility}%
                          </span>
                        </div>
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {engineIcons.gemini}
                          <span className="font-medium tabular-nums">
                            {data.byEngine.gemini.visibility}%
                          </span>
                        </div>
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {engineIcons.grok}
                          <span className="font-medium tabular-nums">
                            {data.byEngine.grok.visibility}%
                          </span>
                        </div>
                      </td>
                      <td className="text-right font-medium tabular-nums">
                        {data.totalAnalyses}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Regions Table */}
      <div className="enterprise-card">
        <div className="enterprise-card-header flex items-center justify-between">
          <div>
            <h3 className="font-semibold">All Regions</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Click to select regions for comparison
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th className="w-8"></th>
                <th>Region</th>
                <th 
                  className="cursor-pointer select-none" 
                  onClick={() => toggleSort("visibility")}
                >
                  <div className="flex items-center gap-1">
                    Visibility
                    <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </th>
                <th 
                  className="cursor-pointer select-none text-right" 
                  onClick={() => toggleSort("analyses")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Analyses
                    <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </th>
                <th className="text-right">Visible</th>
                <th className="text-right">Last Analyzed</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((data) => {
                const regionInfo = getRegionInfo(data.region);
                const isSelected = selectedRegions.includes(data.region);
                
                return (
                  <tr 
                    key={data.region}
                    className={cn(
                      "cursor-pointer",
                      isSelected && "bg-primary/5"
                    )}
                    onClick={() => toggleRegionSelection(data.region)}
                  >
                    <td>
                      <div className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                        isSelected 
                          ? "bg-primary border-primary" 
                          : "border-border"
                      )}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{regionInfo.flag}</span>
                        <span className="font-medium">{regionInfo.name}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              data.visibility >= 70 ? "bg-success" :
                              data.visibility >= 40 ? "bg-warning" : "bg-destructive"
                            )}
                            style={{ width: `${data.visibility}%` }}
                          />
                        </div>
                        <span className={cn(
                          "font-semibold tabular-nums min-w-[3rem]",
                          data.visibility >= 70 ? "text-success" :
                          data.visibility >= 40 ? "text-warning" : "text-destructive"
                        )}>
                          {data.visibility}%
                        </span>
                      </div>
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {data.totalAnalyses}
                    </td>
                    <td className="text-right text-success font-medium tabular-nums">
                      {data.visibleAnalyses}
                    </td>
                    <td className="text-right text-muted-foreground text-sm">
                      {data.lastAnalyzed 
                        ? new Date(data.lastAnalyzed).toLocaleDateString()
                        : "—"
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

