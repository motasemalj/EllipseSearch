"use client";

import { memo, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";

// Custom tooltip component for better styling - memoized
const CustomTooltip = memo(function CustomTooltip({ 
  active, 
  payload, 
  label 
}: { 
  active?: boolean; 
  payload?: Array<{ name: string; value: number; color: string }>; 
  label?: string 
}) {
  if (!active || !payload) return null;
  
  return (
    <div className="rounded-lg border border-border bg-popover/95 backdrop-blur-sm p-3 shadow-xl">
      <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div 
                className="w-2.5 h-2.5 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm">{entry.name}</span>
            </div>
            <span className="text-sm font-semibold">{entry.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
});

interface VisibilityTrendChartProps {
  data: Array<Record<string, string | number>>;
  className?: string;
  series: Array<{ key: string; label: string; color: string }>;
}

export const VisibilityTrendChart = memo(function VisibilityTrendChart({
  data,
  className,
  series,
}: VisibilityTrendChartProps) {
  // Memoize formatted data to prevent recalculation on re-renders
  const formattedData = useMemo(() => 
    data.map(d => ({
      ...d,
      displayDate: new Date(d.date as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    })),
    [data]
  );

  // Memoize gradients JSX
  const gradients = useMemo(() => 
    series.map((s) => (
      <linearGradient key={`gradient-${s.key}`} id={`gradient-${s.key}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={s.color} stopOpacity={0.3} />
        <stop offset="100%" stopColor={s.color} stopOpacity={0} />
      </linearGradient>
    )),
    [series]
  );

  // Memoize areas JSX
  const areas = useMemo(() => 
    series.map((s, index) => (
      <Area
        key={s.key}
        type="monotone"
        dataKey={s.key}
        name={s.label}
        stroke={s.color}
        strokeWidth={2}
        fill={`url(#gradient-${s.key})`}
        dot={false}
        activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
        animationDuration={800}
        animationBegin={index * 50}
      />
    )),
    [series]
  );

  // Don't render chart if no data
  if (!data || data.length === 0) {
    return (
      <div className={cn("h-[280px] w-full flex items-center justify-center", className)}>
        <p className="text-sm text-muted-foreground">No data available</p>
      </div>
    );
  }

  return (
    <div className={cn("h-[280px] w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart 
          data={formattedData} 
          margin={{ left: 0, right: 0, top: 10, bottom: 0 }}
        >
          <defs>
            {gradients}
          </defs>
          <CartesianGrid 
            strokeDasharray="3 3" 
            vertical={false}
            stroke="hsl(var(--border))"
            strokeOpacity={0.5}
          />
          <XAxis 
            dataKey="displayDate" 
            tickLine={false} 
            axisLine={false}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickMargin={8}
            interval="preserveStartEnd"
          />
          <YAxis 
            tickLine={false} 
            axisLine={false} 
            domain={[0, 100]} 
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickMargin={8}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            verticalAlign="top"
            height={36}
            iconType="circle"
            iconSize={8}
            formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
          />
          {areas}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
