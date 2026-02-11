"use client";

import { memo, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "@/lib/utils";
import { Crown, TrendingUp, TrendingDown, Minus, Star } from "lucide-react";

// Colorful palette for competitors
const COMPETITOR_COLORS = [
  "#8B5CF6", // Purple
  "#3B82F6", // Blue
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#EC4899", // Pink
  "#14B8A6", // Teal
  "#6366F1", // Indigo
  "#F97316", // Orange
];

// Brand gets vibrant emerald
const BRAND_COLOR = "#10B981";

interface MarketShareData {
  name: string;
  mentions: number;
  isBrand: boolean;
}

// Custom tooltip component
const CustomTooltip = memo(function CustomTooltip({ 
  active, 
  payload,
}: { 
  active?: boolean; 
  payload?: Array<{ 
    name: string; 
    value: number; 
    payload: MarketShareData & { color: string } 
  }>;
}) {
  if (!active || !payload?.[0]) return null;
  
  const { payload: data, value } = payload[0];
  
  return (
    <div className="rounded-lg border border-border bg-popover/95 backdrop-blur-sm p-3 shadow-xl min-w-[140px]">
      <div className="flex items-center gap-2 mb-1.5">
        <div 
          className={cn(
            "w-3 h-3 rounded-full",
            data.isBrand && "ring-2 ring-offset-1 ring-emerald-400"
          )}
          style={{ backgroundColor: data.color }}
        />
        <span className="text-sm font-semibold">{data.name}</span>
        {data.isBrand && <Crown className="w-3 h-3 text-emerald-500" />}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Mentions:</span>
        <span className="font-medium text-foreground">{value || 0}</span>
      </div>
    </div>
  );
});

interface MarketShareChartProps {
  data: MarketShareData[];
  brandName: string;
  className?: string;
}

export const MarketShareChart = memo(function MarketShareChart({
  data,
  brandName,
  className,
}: MarketShareChartProps) {
  // Memoize enhanced data with colors
  const { enhancedData, brandShare, brandMentions, totalMentions, hasCompetitors } = useMemo(() => {
    if (!data || data.length === 0) {
      return { 
        enhancedData: [], 
        brandShare: 0, 
        brandMentions: 0,
        totalMentions: 0,
        hasCompetitors: false 
      };
    }
    
    // Sort: brand first, then competitors by mentions descending
    const sorted = [...data].sort((a, b) => {
      if (a.isBrand) return -1;
      if (b.isBrand) return 1;
      return b.mentions - a.mentions;
    });

    let competitorIdx = 0;
    const enhanced = sorted.map((d) => ({
      ...d,
      value: d.mentions || 0,
      color: d.isBrand ? BRAND_COLOR : COMPETITOR_COLORS[competitorIdx++ % COMPETITOR_COLORS.length],
    }));
    
    const total = enhanced.reduce((acc, d) => acc + (d.value || 0), 0);
    const brand = enhanced.find(d => d.isBrand);
    const brandVal = brand?.value || 0;
    const share = total > 0 ? (brandVal / total) * 100 : 0;
    
    return { 
      enhancedData: enhanced, 
      brandShare: isNaN(share) ? 0 : share,
      brandMentions: brandVal,
      totalMentions: total,
      hasCompetitors: enhanced.filter(d => !d.isBrand).length > 0
    };
  }, [data]);

  // Memoize cells with brand highlight - white stroke for contrast
  const cells = useMemo(() => 
    enhancedData.map((d) => (
      <Cell 
        key={d.name} 
        fill={d.color}
        stroke={d.isBrand ? "#FFFFFF" : "hsl(var(--background))"}
        strokeWidth={d.isBrand ? 4 : 1}
        style={{ 
          filter: d.isBrand ? "drop-shadow(0 0 12px rgba(16, 185, 129, 0.7))" : "none",
          cursor: "pointer"
        }}
      />
    )),
    [enhancedData]
  );

  // Get trend icon based on share
  const TrendIcon = brandShare >= 30 ? TrendingUp : brandShare >= 15 ? Minus : TrendingDown;

  // Format share display
  const shareDisplay = isNaN(brandShare) ? "0" : brandShare.toFixed(0);

  // Don't render chart if no data
  if (!data || data.length === 0 || totalMentions === 0) {
    return (
      <div className={cn("h-[280px] w-full flex items-center justify-center", className)}>
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">No market share data available</p>
          <p className="text-xs text-muted-foreground/70">Run analyses to see brand mentions</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-[280px] w-full", className)}>
      <div className="flex h-full gap-2">
        {/* Chart */}
        <div className="flex-1 h-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<CustomTooltip />} />
              <Pie 
                data={enhancedData} 
                dataKey="value" 
                nameKey="name" 
                innerRadius="52%"
                outerRadius="90%"
                paddingAngle={hasCompetitors ? 3 : 0}
                strokeWidth={0}
                animationDuration={800}
                animationBegin={0}
              >
                {cells}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          
          {/* Center content overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              </div>
              <p className="text-3xl font-bold">
                {shareDisplay}%
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Your Share
              </p>
            </div>
          </div>
        </div>

        {/* Legend - Side panel */}
        <div className="w-[150px] flex flex-col justify-center">
          {/* Brand highlight card - white border for contrast */}
          <div className="mb-3 p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1 rounded-md bg-white/20">
                <Crown className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-xs font-bold truncate">
                {brandName}
              </span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold">
                  {shareDisplay}%
                </p>
                <p className="text-[10px] text-white/70">
                  {brandMentions} mention{brandMentions !== 1 ? 's' : ''}
                </p>
              </div>
              <div className={cn("p-1.5 rounded-lg bg-white/20")}>
                <TrendIcon className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>

          {/* Competitors list */}
          {hasCompetitors && (
            <div className="space-y-1.5 max-h-[120px] overflow-y-auto scrollbar-thin">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Competitors
              </p>
              {enhancedData
                .filter(d => !d.isBrand)
                .slice(0, 5)
                .map((d) => {
                  const pct = totalMentions > 0 ? ((d.value / totalMentions) * 100) : 0;
                  const pctDisplay = isNaN(pct) ? "0" : pct.toFixed(0);
                  return (
                    <div key={d.name} className="flex items-center gap-2 text-xs">
                      <div 
                        className="w-2.5 h-2.5 rounded-full shrink-0" 
                        style={{ backgroundColor: d.color }}
                      />
                      <span className="truncate flex-1">{d.name}</span>
                      <span className="font-semibold tabular-nums">{pctDisplay}%</span>
                    </div>
                  );
                })}
              {enhancedData.filter(d => !d.isBrand).length > 5 && (
                <p className="text-[10px] text-muted-foreground/60 pl-4">
                  +{enhancedData.filter(d => !d.isBrand).length - 5} more
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
