"use client";

import { useCallback, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

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
  const formattedData = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        displayDate: new Date(item.date as string).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      })),
    [data]
  );

  const [zoomRange, setZoomRange] = useState<{ start: number; end: number } | null>(null);
  const [zoomPreset, setZoomPreset] = useState<"all" | "7d" | "14d" | "30d" | "60d" | "90d" | "custom">("all");

  const displayData = useMemo(() => {
    if (!zoomRange) return formattedData;
    return formattedData.slice(zoomRange.start, zoomRange.end + 1);
  }, [formattedData, zoomRange]);

  const resetZoom = useCallback(() => {
    setZoomRange(null);
    setZoomPreset("all");
  }, []);

  const applyPreset = useCallback(
    (days: 7 | 14 | 30 | 60 | 90) => {
      if (formattedData.length <= days) {
        resetZoom();
        return;
      }
      setZoomRange({ start: Math.max(0, formattedData.length - days), end: formattedData.length - 1 });
      setZoomPreset(`${days}d` as "7d" | "14d" | "30d" | "60d" | "90d");
    },
    [formattedData.length, resetZoom]
  );

  const zoomIn = useCallback(() => {
    const currentStart = zoomRange?.start ?? 0;
    const currentEnd = zoomRange?.end ?? formattedData.length - 1;
    const currentLength = currentEnd - currentStart + 1;
    if (currentLength <= 7) return;
    const trimAmount = Math.ceil(currentLength * 0.2);
    const newStart = currentStart + trimAmount;
    const newEnd = currentEnd - trimAmount;
    if (newEnd > newStart) {
      setZoomRange({ start: newStart, end: newEnd });
      setZoomPreset("custom");
    }
  }, [formattedData.length, zoomRange]);

  const zoomOut = useCallback(() => {
    if (!zoomRange) return;
    const currentLength = zoomRange.end - zoomRange.start + 1;
    const expandAmount = Math.ceil(currentLength * 0.2);
    const newStart = Math.max(0, zoomRange.start - expandAmount);
    const newEnd = Math.min(formattedData.length - 1, zoomRange.end + expandAmount);
    if (newStart === 0 && newEnd === formattedData.length - 1) {
      resetZoom();
    } else {
      setZoomRange({ start: newStart, end: newEnd });
      setZoomPreset("custom");
    }
  }, [formattedData.length, resetZoom, zoomRange]);

  const isZoomed = zoomRange !== null;
  const canZoomIn = displayData.length > 7;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex flex-wrap items-center justify-end gap-2 mb-2">
        <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5">
          <button
            onClick={() => applyPreset(7)}
            className={cn(
              "px-2 py-1 text-xs font-medium rounded transition-colors",
              zoomPreset === "7d" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            7d
          </button>
          <button
            onClick={() => applyPreset(14)}
            className={cn(
              "px-2 py-1 text-xs font-medium rounded transition-colors",
              zoomPreset === "14d" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            14d
          </button>
          <button
            onClick={() => applyPreset(30)}
            className={cn(
              "px-2 py-1 text-xs font-medium rounded transition-colors",
              zoomPreset === "30d" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            30d
          </button>
          <button
            onClick={() => applyPreset(60)}
            className={cn(
              "px-2 py-1 text-xs font-medium rounded transition-colors",
              zoomPreset === "60d" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            60d
          </button>
          <button
            onClick={() => applyPreset(90)}
            className={cn(
              "px-2 py-1 text-xs font-medium rounded transition-colors",
              zoomPreset === "90d" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            90d
          </button>
          <button
            onClick={resetZoom}
            className={cn(
              "px-2 py-1 text-xs font-medium rounded transition-colors",
              zoomPreset === "all" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            All
          </button>
        </div>

        <div className="flex items-center gap-0.5 border-l border-border pl-2">
          <Button variant="ghost" size="sm" onClick={zoomIn} disabled={!canZoomIn} className="h-7 w-7 p-0" title="Zoom in">
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={zoomOut} disabled={!isZoomed} className="h-7 w-7 p-0" title="Zoom out">
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={resetZoom} disabled={!isZoomed} className="h-7 w-7 p-0" title="Reset zoom">
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={displayData} margin={{ left: 0, right: 16, top: 16, bottom: 16 }}>
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
    </div>
  );
}
