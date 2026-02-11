"use client";

import { memo, useMemo, useState, useCallback } from "react";
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
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

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

// Engine filter button component
const EngineFilterButton = memo(function EngineFilterButton({
  label,
  color,
  isActive,
  onClick,
}: {
  label: string;
  color: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all",
        isActive 
          ? "bg-muted/80 text-foreground" 
          : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
      )}
    >
      <div 
        className={cn(
          "w-2 h-2 rounded-full transition-opacity",
          !isActive && "opacity-40"
        )}
        style={{ backgroundColor: color }}
      />
      {label}
      {isActive ? (
        <Eye className="w-3 h-3 ml-0.5" />
      ) : (
        <EyeOff className="w-3 h-3 ml-0.5 opacity-50" />
      )}
    </button>
  );
});

interface VisibilityTrendChartProps {
  data: Array<Record<string, string | number>>;
  className?: string;
  series: Array<{ key: string; label: string; color: string }>;
  showControls?: boolean;
}

export const VisibilityTrendChart = memo(function VisibilityTrendChart({
  data,
  className,
  series,
  showControls = true,
}: VisibilityTrendChartProps) {
  // State for active series (engine filters)
  const [activeSeries, setActiveSeries] = useState<Set<string>>(() => 
    new Set(series.map(s => s.key))
  );
  
  // State for zoom
  const [zoomRange, setZoomRange] = useState<{ start: number; end: number } | null>(null);
  const [zoomPreset, setZoomPreset] = useState<"all" | "7d" | "14d" | "30d" | "60d" | "90d" | "custom">("all");

  // Memoize formatted data to prevent recalculation on re-renders
  const formattedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map(d => ({
      ...d,
      displayDate: new Date(d.date as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }));
  }, [data]);

  // Get zoomed/filtered data
  const displayData = useMemo(() => {
    if (!zoomRange) return formattedData;
    return formattedData.slice(zoomRange.start, zoomRange.end + 1);
  }, [formattedData, zoomRange]);

  // Toggle series visibility
  const toggleSeries = useCallback((key: string) => {
    setActiveSeries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        // Don't allow hiding all series
        if (newSet.size > 1) {
          newSet.delete(key);
        }
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }, []);

  // Show all series
  const showAllSeries = useCallback(() => {
    setActiveSeries(new Set(series.map(s => s.key)));
  }, [series]);

  // Zoom in - show middle 60% of current view
  const zoomIn = useCallback(() => {
    const currentStart = zoomRange?.start ?? 0;
    const currentEnd = zoomRange?.end ?? formattedData.length - 1;
    const currentLength = currentEnd - currentStart + 1;
    
    if (currentLength <= 7) return; // Minimum 7 data points
    
    const trimAmount = Math.ceil(currentLength * 0.2);
    const newStart = currentStart + trimAmount;
    const newEnd = currentEnd - trimAmount;
    
    if (newEnd > newStart) {
      setZoomRange({ start: newStart, end: newEnd });
      setZoomPreset("custom");
    }
  }, [zoomRange, formattedData.length]);

  // Zoom out - expand view by 40%
  const zoomOut = useCallback(() => {
    if (!zoomRange) return;
    
    const currentLength = zoomRange.end - zoomRange.start + 1;
    const expandAmount = Math.ceil(currentLength * 0.2);
    
    const newStart = Math.max(0, zoomRange.start - expandAmount);
    const newEnd = Math.min(formattedData.length - 1, zoomRange.end + expandAmount);
    
    // If we're back to full range, clear zoom
    if (newStart === 0 && newEnd === formattedData.length - 1) {
      setZoomRange(null);
      setZoomPreset("all");
    } else {
      setZoomRange({ start: newStart, end: newEnd });
      setZoomPreset("custom");
    }
  }, [zoomRange, formattedData.length]);

  // Reset zoom
  const resetZoom = useCallback(() => {
    setZoomRange(null);
    setZoomPreset("all");
  }, []);

  const applyPreset = useCallback(
    (days: 7 | 14 | 30 | 60 | 90) => {
      if (formattedData.length <= days) {
        setZoomRange(null);
        setZoomPreset("all");
        return;
      }
      setZoomRange({ start: Math.max(0, formattedData.length - days), end: formattedData.length - 1 });
      setZoomPreset(`${days}d` as "7d" | "14d" | "30d" | "60d" | "90d");
    },
    [formattedData.length]
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

  // Memoize areas JSX - only render active series
  const areas = useMemo(() => 
    series
      .filter(s => activeSeries.has(s.key))
      .map((s, index) => (
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
    [series, activeSeries]
  );

  // Don't render chart if no data
  if (!data || data.length === 0) {
    return (
      <div className={cn("h-[280px] w-full flex items-center justify-center", className)}>
        <p className="text-sm text-muted-foreground">No data available</p>
      </div>
    );
  }

  const allSeriesActive = activeSeries.size === series.length;
  const isZoomed = zoomRange !== null;
  const canZoomIn = displayData.length > 7;

  return (
    <div className={cn("w-full", className)}>
      {/* Controls */}
      {showControls && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          {/* Engine filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            {series.map((s) => (
              <EngineFilterButton
                key={s.key}
                label={s.label}
                color={s.color}
                isActive={activeSeries.has(s.key)}
                onClick={() => toggleSeries(s.key)}
              />
            ))}
            {!allSeriesActive && (
              <button
                onClick={showAllSeries}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
              >
                Show all
              </button>
            )}
          </div>

          {/* Time range presets & Zoom controls */}
          <div className="flex items-center gap-2">
            {/* Time range presets */}
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
            
            {/* Zoom controls */}
            <div className="flex items-center gap-0.5 border-l border-border pl-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={zoomIn}
                disabled={!canZoomIn}
                className="h-7 w-7 p-0"
                title="Zoom in"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={zoomOut}
                disabled={!isZoomed}
                className="h-7 w-7 p-0"
                title="Zoom out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetZoom}
                disabled={!isZoomed}
                className="h-7 w-7 p-0"
                title="Reset zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
            </div>
            {isZoomed && (
              <span className="text-[10px] text-muted-foreground">
                Showing {displayData.length} days
              </span>
            )}
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart 
            data={displayData} 
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
            {!showControls && (
              <Legend 
                verticalAlign="top"
                height={36}
                iconType="circle"
                iconSize={8}
                formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
              />
            )}
            {areas}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
