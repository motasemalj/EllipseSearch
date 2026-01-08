"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  TooltipProps,
} from "recharts";
import { cn } from "@/lib/utils";

interface CustomTooltipProps extends TooltipProps<number, string> {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    name: string;
    color: string;
  }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium text-foreground mb-2">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">
              Selection {entry.dataKey === "a" ? "A" : "B"}
            </span>
          </div>
          <span className="font-medium">{entry.value}%</span>
        </div>
      ))}
    </div>
  );
}

export function CompareBarChart({
  data,
  aKey,
  bKey,
  className,
}: {
  data: Array<Record<string, string | number>>;
  aKey: string;
  bKey: string;
  className?: string;
}) {
  return (
    <div className={cn("h-[300px] w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 16, top: 16, bottom: 16 }} barGap={8}>
          <CartesianGrid 
            strokeDasharray="3 3" 
            vertical={false}
            stroke="hsl(var(--border))"
            opacity={0.5}
          />
          <XAxis 
            dataKey="label" 
            tickLine={false} 
            axisLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            dy={8}
          />
          <YAxis 
            tickLine={false} 
            axisLine={false} 
            domain={[0, 100]} 
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            width={45}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
          <Bar 
            dataKey={aKey} 
            fill="hsl(var(--primary))" 
            radius={[6, 6, 0, 0]} 
            name="Selection A"
            maxBarSize={60}
          />
          <Bar 
            dataKey={bKey} 
            fill="hsl(var(--muted-foreground)/0.5)" 
            radius={[6, 6, 0, 0]} 
            name="Selection B"
            maxBarSize={60}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CompareTrendChart({
  data,
  aKey,
  bKey,
  className,
}: {
  data: Array<Record<string, string | number>>;
  aKey: string;
  bKey: string;
  className?: string;
}) {
  // Format date for display
  const formattedData = data.map(item => ({
    ...item,
    displayDate: new Date(item.date as string).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    }),
  }));

  return (
    <div className={cn("h-[300px] w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formattedData} margin={{ left: 0, right: 16, top: 16, bottom: 16 }}>
          <CartesianGrid 
            strokeDasharray="3 3" 
            vertical={false}
            stroke="hsl(var(--border))"
            opacity={0.5}
          />
          <XAxis 
            dataKey="displayDate" 
            tickLine={false} 
            axisLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            dy={8}
            interval="preserveStartEnd"
          />
          <YAxis 
            tickLine={false} 
            axisLine={false} 
            domain={[0, 100]} 
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            width={45}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line 
            type="monotone" 
            dataKey={aKey} 
            stroke="hsl(var(--primary))" 
            strokeWidth={2.5} 
            dot={false}
            activeDot={{ r: 6, strokeWidth: 2, stroke: "hsl(var(--background))" }}
            name="Selection A"
          />
          <Line
            type="monotone"
            dataKey={bKey}
            stroke="hsl(var(--muted-foreground)/0.5)"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 6, strokeWidth: 2, stroke: "hsl(var(--background))" }}
            name="Selection B"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
