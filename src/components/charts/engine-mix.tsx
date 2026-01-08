"use client";

import { memo, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { cn } from "@/lib/utils";

// Engine-specific colors that work in both dark and light mode
const ENGINE_COLORS = {
  ChatGPT: { main: "#10B981", light: "#D1FAE5", dark: "#065F46" },
  Perplexity: { main: "#8B5CF6", light: "#EDE9FE", dark: "#5B21B6" },
  Gemini: { main: "#3B82F6", light: "#DBEAFE", dark: "#1E40AF" },
  Grok: { main: "#6B7280", light: "#E5E7EB", dark: "#374151" },
} as const;

// Custom tooltip component - memoized
const CustomTooltip = memo(function CustomTooltip({ 
  active, 
  payload 
}: { 
  active?: boolean; 
  payload?: Array<{ name: string; value: number; payload: { color: string; percent: number } }> 
}) {
  if (!active || !payload?.[0]) return null;
  
  const { name, value, payload: data } = payload[0];
  const percent = (data.percent * 100).toFixed(1);
  
  return (
    <div className="rounded-lg border border-border bg-popover/95 backdrop-blur-sm p-3 shadow-xl">
      <div className="flex items-center gap-2 mb-1">
        <div 
          className="w-3 h-3 rounded-full" 
          style={{ backgroundColor: data.color }}
        />
        <span className="text-sm font-medium">{name}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{value}</span> analyses ({percent}%)
      </div>
    </div>
  );
});

// Custom legend component - memoized
const CustomLegend = memo(function CustomLegend({ 
  payload 
}: { 
  payload?: Array<{ value: string; color: string; payload: { value: number } }> 
}) {
  if (!payload) return null;
  
  const total = payload.reduce((sum, entry) => sum + entry.payload.value, 0);
  
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4">
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <div 
            className="w-2.5 h-2.5 rounded-full" 
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-xs text-muted-foreground">
            {entry.value}
            <span className="ml-1 font-medium text-foreground tabular-nums">
              {((entry.payload.value / total) * 100).toFixed(0)}%
            </span>
          </span>
        </div>
      ))}
    </div>
  );
});

interface EngineMixChartProps {
  data: Array<{ name: string; value: number; color: string }>;
  className?: string;
}

export const EngineMixChart = memo(function EngineMixChart({
  data,
  className,
}: EngineMixChartProps) {
  // Memoize enhanced data
  const { enhancedData, total } = useMemo(() => {
    const enhanced = data.map(d => ({
      ...d,
      color: ENGINE_COLORS[d.name as keyof typeof ENGINE_COLORS]?.main || d.color,
    }));
    const sum = enhanced.reduce((acc, d) => acc + d.value, 0);
    return { enhancedData: enhanced, total: sum };
  }, [data]);

  // Memoize gradients
  const gradients = useMemo(() => 
    enhancedData.map((d) => (
      <linearGradient key={`gradient-${d.name}`} id={`pieGradient-${d.name}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={d.color} stopOpacity={1} />
        <stop offset="100%" stopColor={d.color} stopOpacity={0.7} />
      </linearGradient>
    )),
    [enhancedData]
  );

  // Memoize cells
  const cells = useMemo(() => 
    enhancedData.map((d) => (
      <Cell 
        key={d.name} 
        fill={`url(#pieGradient-${d.name})`}
        stroke="hsl(var(--background))"
        strokeWidth={2}
      />
    )),
    [enhancedData]
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
        <PieChart>
          <defs>
            {gradients}
          </defs>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
          <Pie 
            data={enhancedData} 
            dataKey="value" 
            nameKey="name" 
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={3}
            strokeWidth={0}
            animationDuration={800}
            animationBegin={0}
          >
            {cells}
          </Pie>
          {/* Center text */}
          <text
            x="50%"
            y="45%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-foreground"
            style={{ fontSize: '24px', fontWeight: 'bold' }}
          >
            {total}
          </text>
          <text
            x="50%"
            y="55%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground"
            style={{ fontSize: '11px' }}
          >
            Total
          </text>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
});
