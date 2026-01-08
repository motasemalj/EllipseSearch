"use client";

import { cn } from "@/lib/utils";

// =============================================================================
// SKELETON LOADING COMPONENTS
// Optimized loading states that match the actual UI structure
// =============================================================================

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted/60",
        className
      )}
      {...props}
    />
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-10 w-10 rounded-xl" />
      </div>
    </div>
  );
}

export function EngineCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-12" />
        </div>
      </div>
    </div>
  );
}

export function ChartCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="space-y-2 mb-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-[200px] w-full" />
    </div>
  );
}

export function BrandCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3 flex-1">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="w-20 h-12" />
      </div>
      <div className="flex gap-2 mb-4">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="pt-4 border-t border-border/50 flex justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-16" />
      </div>
    </div>
  );
}

export function RecentBatchRowSkeleton() {
  return (
    <div className="flex items-center justify-between p-4">
      <div className="flex items-center gap-4">
        <Skeleton className="w-10 h-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-4 w-4" />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
      </div>

      {/* Engine Cards */}
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <EngineCardSkeleton />
          <EngineCardSkeleton />
          <EngineCardSkeleton />
          <EngineCardSkeleton />
        </div>
      </div>

      {/* Charts */}
      <div className="space-y-4">
        <Skeleton className="h-6 w-24" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartCardSkeleton />
          <ChartCardSkeleton />
          <ChartCardSkeleton />
          <ChartCardSkeleton />
        </div>
      </div>

      {/* Brands */}
      <div className="space-y-4">
        <Skeleton className="h-6 w-28" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BrandCardSkeleton />
          <BrandCardSkeleton />
        </div>
      </div>
    </div>
  );
}

export function BrandsPageSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-10" />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BrandCardSkeleton />
        <BrandCardSkeleton />
        <BrandCardSkeleton />
        <BrandCardSkeleton />
      </div>
    </div>
  );
}

export function BrandPageSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-14 w-14 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-10" />
        </div>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <Skeleton className="h-32 w-32 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="md:col-span-2 grid grid-cols-2 gap-4">
          <EngineCardSkeleton />
          <EngineCardSkeleton />
          <EngineCardSkeleton />
          <EngineCardSkeleton />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
    </div>
  );
}

