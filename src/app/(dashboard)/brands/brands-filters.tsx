"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BrandFavicon } from "@/components/ui/brand-favicon";
import { 
  Search, 
  SlidersHorizontal,
  ChevronRight,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Filter,
  X,
} from "lucide-react";
import { ChatGPTIcon, PerplexityIcon, GeminiIcon, GrokIcon } from "@/components/ui/engine-badge";
import { cn } from "@/lib/utils";
import { Brand, SupportedEngine } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface BrandWithVisibility {
  brand: Brand;
  visibility?: {
    overall: number;
    byEngine: Partial<Record<SupportedEngine, number>>;
  };
  simulationsCount: number;
}

interface BrandsFiltersProps {
  brands: BrandWithVisibility[];
}

const engineIcons: Record<SupportedEngine, React.ReactNode> = {
  chatgpt: <ChatGPTIcon className="w-3.5 h-3.5" />,
  perplexity: <PerplexityIcon className="w-3.5 h-3.5" />,
  gemini: <GeminiIcon className="w-3.5 h-3.5" />,
  grok: <GrokIcon className="w-3.5 h-3.5" />,
};

export function BrandsFilters({ brands }: BrandsFiltersProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "visibility" | "analyses">("name");
  const [filterVisibility, setFilterVisibility] = useState<"all" | "high" | "medium" | "low">("all");
  const [filterHasAnalyses, setFilterHasAnalyses] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const activeFiltersCount = [
    filterVisibility !== "all",
    filterHasAnalyses,
  ].filter(Boolean).length;

  const filteredBrands = useMemo(() => {
    let result = [...brands];
    
    // Filter by search
    if (search) {
      const query = search.toLowerCase();
      result = result.filter(b => 
        b.brand.name.toLowerCase().includes(query) ||
        b.brand.domain.toLowerCase().includes(query)
      );
    }

    // Filter by visibility
    if (filterVisibility !== "all") {
      result = result.filter(b => {
        const vis = b.visibility?.overall ?? 0;
        switch (filterVisibility) {
          case "high":
            return vis >= 70;
          case "medium":
            return vis >= 40 && vis < 70;
          case "low":
            return vis < 40;
          default:
            return true;
        }
      });
    }

    // Filter by has analyses
    if (filterHasAnalyses) {
      result = result.filter(b => b.simulationsCount > 0);
    }
    
    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "visibility":
          return (b.visibility?.overall ?? 0) - (a.visibility?.overall ?? 0);
        case "analyses":
          return b.simulationsCount - a.simulationsCount;
        default:
          return a.brand.name.localeCompare(b.brand.name);
      }
    });
    
    return result;
  }, [brands, search, sortBy, filterVisibility, filterHasAnalyses]);

  function clearFilters() {
    setFilterVisibility("all");
    setFilterHasAnalyses(false);
  }

  const getVisibilityColor = (v: number | undefined) => {
    if (v === undefined) return "text-muted-foreground";
    if (v >= 70) return "text-success";
    if (v >= 40) return "text-warning";
    return "text-destructive";
  };

  const getVisibilityIcon = (v: number | undefined) => {
    if (v === undefined) return <Clock className="w-3.5 h-3.5" />;
    if (v >= 70) return <TrendingUp className="w-3.5 h-3.5" />;
    if (v >= 40) return <Minus className="w-3.5 h-3.5" />;
    return <TrendingDown className="w-3.5 h-3.5" />;
  };

  return (
    <div className="space-y-4">
      {/* Filters Row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search brands..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        
        {/* Filter Button */}
        <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="w-4 h-4" />
              Filters
              {activeFiltersCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                  {activeFiltersCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="start">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Filters</h4>
                {activeFiltersCount > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-auto py-1 px-2 text-xs"
                    onClick={clearFilters}
                  >
                    Clear all
                  </Button>
                )}
              </div>
              
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm">Visibility Level</Label>
                  <Select value={filterVisibility} onValueChange={(v) => setFilterVisibility(v as typeof filterVisibility)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All visibility levels</SelectItem>
                      <SelectItem value="high">
                        <span className="flex items-center gap-2">
                          <TrendingUp className="w-3.5 h-3.5 text-success" />
                          High (70%+)
                        </span>
                      </SelectItem>
                      <SelectItem value="medium">
                        <span className="flex items-center gap-2">
                          <Minus className="w-3.5 h-3.5 text-warning" />
                          Medium (40-70%)
                        </span>
                      </SelectItem>
                      <SelectItem value="low">
                        <span className="flex items-center gap-2">
                          <TrendingDown className="w-3.5 h-3.5 text-destructive" />
                          Low (&lt;40%)
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="hasAnalyses" 
                    checked={filterHasAnalyses}
                    onCheckedChange={(checked) => setFilterHasAnalyses(checked === true)}
                  />
                  <Label htmlFor="hasAnalyses" className="text-sm cursor-pointer">
                    Only brands with analyses
                  </Label>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-40">
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Sort by Name</SelectItem>
            <SelectItem value="visibility">Sort by Visibility</SelectItem>
            <SelectItem value="analyses">Sort by Analyses</SelectItem>
          </SelectContent>
        </Select>

        <p className="text-sm text-muted-foreground">
          {filteredBrands.length} of {brands.length} brands
        </p>
      </div>

      {/* Active Filters Display */}
      {activeFiltersCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {filterVisibility !== "all" && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-sm">
              Visibility: {filterVisibility}
              <button onClick={() => setFilterVisibility("all")} className="hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filterHasAnalyses && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-sm">
              Has analyses
              <button onClick={() => setFilterHasAnalyses(false)} className="hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Brands Grid */}
      <div className="enterprise-card">
        {filteredBrands.length === 0 ? (
          <div className="empty-state py-12">
            <Search className="empty-state-icon" />
            <h3 className="empty-state-title">No brands found</h3>
            <p className="empty-state-description">
              Try adjusting your search or filters
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredBrands.map(({ brand, visibility, simulationsCount }) => (
              <Link
                key={brand.id}
                href={`/brands/${brand.id}`}
                className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors"
              >
                {/* Brand Info */}
                <BrandFavicon domain={brand.domain} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{brand.name}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {brand.domain}
                  </p>
                </div>

                {/* Engine Visibility Mini Bars */}
                <div className="hidden md:flex items-center gap-3">
                  {(["chatgpt", "perplexity", "gemini", "grok"] as SupportedEngine[]).map(engine => {
                    const engineVis = visibility?.byEngine[engine];
                    return (
                      <div key={engine} className="flex items-center gap-1.5" title={`${engine}: ${engineVis ?? 0}%`}>
                        {engineIcons[engine]}
                        <div className="w-10 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              engineVis !== undefined && engineVis >= 70 ? "bg-success" :
                              engineVis !== undefined && engineVis >= 40 ? "bg-warning" : "bg-destructive"
                            )}
                            style={{ width: `${engineVis ?? 0}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Analyses Count */}
                <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Activity className="w-3.5 h-3.5" />
                  <span className="tabular-nums">{simulationsCount}</span>
                </div>

                {/* Overall Visibility */}
                <div className={cn(
                  "flex items-center gap-1.5 min-w-[60px] justify-end",
                  getVisibilityColor(visibility?.overall)
                )}>
                  {getVisibilityIcon(visibility?.overall)}
                  <span className="text-lg font-bold tabular-nums">
                    {visibility?.overall ?? "—"}
                    {visibility?.overall !== undefined && "%"}
                  </span>
                </div>

                {/* Chevron */}
                <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
