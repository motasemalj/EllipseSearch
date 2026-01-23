"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandCard } from "@/components/dashboard/brand-card";
import { Brand, SupportedEngine } from "@/types";
import { Search, Filter, Grid, List, X, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type LayoutMode = "grid" | "list";
type SortOption = "name" | "visibility" | "recent";
type VisibilityFilter = "all" | "high" | "medium" | "low" | "none";

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

export function BrandsFilters({ brands }: BrandsFiltersProps) {
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState<LayoutMode>("grid");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");

  // Filter and sort brands
  const filteredBrands = useMemo(() => {
    let result = [...brands];

    // Search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        ({ brand }) =>
          brand.name.toLowerCase().includes(searchLower) ||
          brand.domain.toLowerCase().includes(searchLower) ||
          brand.primary_location?.toLowerCase().includes(searchLower)
      );
    }

    // Visibility filter
    if (visibilityFilter !== "all") {
      result = result.filter(({ visibility }) => {
        const score = visibility?.overall ?? 0;
        switch (visibilityFilter) {
          case "high":
            return score >= 70;
          case "medium":
            return score >= 40 && score < 70;
          case "low":
            return score > 0 && score < 40;
          case "none":
            return score === 0;
          default:
            return true;
        }
      });
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.brand.name.localeCompare(b.brand.name);
        case "visibility":
          return (b.visibility?.overall ?? 0) - (a.visibility?.overall ?? 0);
        case "recent":
          return new Date(b.brand.created_at).getTime() - new Date(a.brand.created_at).getTime();
        default:
          return 0;
      }
    });

    return result;
  }, [brands, search, sortBy, visibilityFilter]);

  const hasActiveFilters = visibilityFilter !== "all" || sortBy !== "name";

  const clearFilters = () => {
    setVisibilityFilter("all");
    setSortBy("name");
    setSearch("");
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search brands..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {/* Filter Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="default" className="gap-2">
                <Filter className="w-4 h-4" />
                Filter
                {hasActiveFilters && (
                  <span className="flex h-2 w-2 rounded-full bg-primary" />
                )}
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Visibility</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={visibilityFilter === "all"}
                onCheckedChange={() => setVisibilityFilter("all")}
              >
                All Brands
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={visibilityFilter === "high"}
                onCheckedChange={() => setVisibilityFilter("high")}
              >
                High Visibility (≥70%)
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={visibilityFilter === "medium"}
                onCheckedChange={() => setVisibilityFilter("medium")}
              >
                Medium Visibility (40-69%)
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={visibilityFilter === "low"}
                onCheckedChange={() => setVisibilityFilter("low")}
              >
                Low Visibility (1-39%)
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={visibilityFilter === "none"}
                onCheckedChange={() => setVisibilityFilter("none")}
              >
                No Visibility (0%)
              </DropdownMenuCheckboxItem>
              
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Sort By</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={sortBy === "name"}
                onCheckedChange={() => setSortBy("name")}
              >
                Name (A-Z)
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={sortBy === "visibility"}
                onCheckedChange={() => setSortBy("visibility")}
              >
                Visibility (High to Low)
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={sortBy === "recent"}
                onCheckedChange={() => setSortBy("recent")}
              >
                Recently Added
              </DropdownMenuCheckboxItem>

              {hasActiveFilters && (
                <>
                  <DropdownMenuSeparator />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground"
                    onClick={clearFilters}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Clear Filters
                  </Button>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Layout Toggle */}
          <div className="flex rounded-lg border border-border">
            <Button
              variant={layout === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="rounded-r-none border-0"
              onClick={() => setLayout("grid")}
            >
              <Grid className="w-4 h-4" />
            </Button>
            <Button
              variant={layout === "list" ? "secondary" : "ghost"}
              size="icon"
              className="rounded-l-none border-0"
              onClick={() => setLayout("list")}
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Active Filters */}
      {(hasActiveFilters || search) && (
        <div className="flex flex-wrap gap-2">
          {search && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-sm">
              <span>Search: &quot;{search}&quot;</span>
              <button onClick={() => setSearch("")} className="hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {visibilityFilter !== "all" && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-sm">
              <span>
                {visibilityFilter === "high" && "High Visibility"}
                {visibilityFilter === "medium" && "Medium Visibility"}
                {visibilityFilter === "low" && "Low Visibility"}
                {visibilityFilter === "none" && "No Visibility"}
              </span>
              <button onClick={() => setVisibilityFilter("all")} className="hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {sortBy !== "name" && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-sm">
              <span>
                {sortBy === "visibility" && "Sorted by Visibility"}
                {sortBy === "recent" && "Sorted by Recent"}
              </span>
              <button onClick={() => setSortBy("name")} className="hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Results Count */}
      {filteredBrands.length !== brands.length && (
        <p className="text-sm text-muted-foreground">
          Showing {filteredBrands.length} of {brands.length} brands
        </p>
      )}

      {/* Brands Grid/List */}
      {filteredBrands.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">
            No brands match your filters.{" "}
            <button onClick={clearFilters} className="text-primary hover:underline">
              Clear filters
            </button>
          </p>
        </div>
      ) : (
        <div
          className={
            layout === "grid"
              ? "grid grid-cols-1 lg:grid-cols-2 gap-4"
              : "flex flex-col gap-3"
          }
        >
          {filteredBrands.map(({ brand, visibility, simulationsCount }) => (
            <BrandCard
              key={brand.id}
              brand={brand}
              visibility={visibility}
              simulationsCount={simulationsCount}
              compact={layout === "list"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

