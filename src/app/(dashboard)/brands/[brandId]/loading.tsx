import { MetricCardSkeleton, ChartCardSkeleton } from "@/components/loading/dashboard-skeleton";

/**
 * Generic loading skeleton for all brand sub-pages.
 * Uses a neutral layout (metric cards + charts) that works as a transition
 * for overview, prompts, activity, analytics, citations, and regions pages.
 * Sub-page client components then take over with their own specific skeletons.
 */
export default function BrandLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Metric cards row - fits all sub-pages */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
      </div>

      {/* Content area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
    </div>
  );
}
