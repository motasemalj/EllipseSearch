"use client";

import { memo, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";

// Custom tooltip component - memoized
const CustomTooltip = memo(function CustomTooltip({ 
  active, 
  payload, 
  label 
}: { 
  active?: boolean; 
  payload?: Array<{ value: number }>; 
  label?: string 
}) {
  if (!active || !payload?.[0]) return null;
  
  return (
    <div className="rounded-lg border border-border bg-popover/95 backdrop-blur-sm p-3 shadow-xl">
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-primary" />
        <span className="text-sm font-semibold">{payload[0].value} analyses</span>
      </div>
    </div>
  );
});

interface SimulationsVolumeChartProps {
  data: Array<{ date: string; total: number }>;
  className?: string;
}

export const SimulationsVolumeChart = memo(function SimulationsVolumeChart({
  data,
  className,
}: SimulationsVolumeChartProps) {
  // Memoize data processing
  const { formattedData } = useMemo(() => {
    const max = Math.max(...data.map(d => d.total), 1);
    const formatted = data.map(d => ({
      ...d,
      displayDate: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      intensity: d.total / max,
    }));
    return { formattedData: formatted };
  }, [data]);

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
        <BarChart 
          data={formattedData} 
          margin={{ left: 0, right: 0, top: 10, bottom: 0 }}
        >
          <defs>
            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={1} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
            </linearGradient>
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
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickMargin={8}
            width={35}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
          <Bar 
            dataKey="total" 
            name="Simulations" 
            radius={[4, 4, 0, 0]}
            animationDuration={800}
          >
            {formattedData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill="url(#barGradient)"
                opacity={0.6 + (entry.intensity * 0.4)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
