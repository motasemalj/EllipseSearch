"use client";

import { cn } from "@/lib/utils";

interface ScoreRadarProps {
  scores: {
    label: string;
    value: number; // 1-5
    maxValue?: number;
  }[];
  size?: number;
  className?: string;
}

export function ScoreRadar({ scores, size = 200, className }: ScoreRadarProps) {
  const center = size / 2;
  const maxRadius = (size / 2) * 0.75;
  const numPoints = scores.length;
  const angleStep = (2 * Math.PI) / numPoints;

  // Generate points for the background pentagon layers
  const generatePolygon = (radiusPercent: number) => {
    return scores
      .map((_, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const r = maxRadius * radiusPercent;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(" ");
  };

  // Generate points for the data polygon
  const generateDataPolygon = () => {
    return scores
      .map((score, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const maxVal = score.maxValue || 5;
        const r = maxRadius * (score.value / maxVal);
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(" ");
  };

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        {/* Background layers */}
        {[0.2, 0.4, 0.6, 0.8, 1].map((percent, i) => (
          <polygon
            key={i}
            points={generatePolygon(percent)}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="text-muted/20"
          />
        ))}
        
        {/* Axis lines */}
        {scores.map((_, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const x = center + maxRadius * Math.cos(angle);
          const y = center + maxRadius * Math.sin(angle);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="currentColor"
              strokeWidth="1"
              className="text-muted/20"
            />
          );
        })}

        {/* Data polygon */}
        <polygon
          points={generateDataPolygon()}
          fill="hsl(var(--primary) / 0.2)"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          className="transition-all duration-700"
        />

        {/* Data points */}
        {scores.map((score, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const maxVal = score.maxValue || 5;
          const r = maxRadius * (score.value / maxVal);
          const x = center + r * Math.cos(angle);
          const y = center + r * Math.sin(angle);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="4"
              fill="hsl(var(--primary))"
              className="transition-all duration-700"
            />
          );
        })}
      </svg>

      {/* Labels */}
      {scores.map((score, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const labelRadius = maxRadius + 25;
        const x = center + labelRadius * Math.cos(angle);
        const y = center + labelRadius * Math.sin(angle);
        return (
          <div
            key={i}
            className="absolute text-xs text-muted-foreground font-medium text-center whitespace-nowrap"
            style={{
              left: x,
              top: y,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div>{score.label}</div>
            <div className="text-foreground font-bold">{score.value}/5</div>
          </div>
        );
      })}
    </div>
  );
}

interface ScoreBarProps {
  label: string;
  value: number;
  maxValue?: number;
  showValue?: boolean;
  className?: string;
}

export function ScoreBar({ label, value, maxValue = 5, showValue = true, className }: ScoreBarProps) {
  const percentage = (value / maxValue) * 100;
  
  const getColor = (val: number, max: number) => {
    const ratio = val / max;
    if (ratio >= 0.7) return "bg-green-500";
    if (ratio >= 0.4) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        {showValue && <span className="font-semibold">{value}/{maxValue}</span>}
      </div>
      <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", getColor(value, maxValue))}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

interface ScoreGridProps {
  scores: { label: string; value: number; icon?: React.ReactNode }[];
  columns?: 2 | 3 | 5;
  className?: string;
}

export function ScoreGrid({ scores, columns = 5, className }: ScoreGridProps) {
  const gridCols = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    5: "grid-cols-5",
  };

  return (
    <div className={cn("grid gap-4", gridCols[columns], className)}>
      {scores.map((score, i) => (
        <div 
          key={i} 
          className="flex flex-col items-center p-3 rounded-lg bg-muted/10 border border-border"
        >
          {score.icon && <div className="mb-2 text-muted-foreground">{score.icon}</div>}
          <span className="text-2xl font-bold">{score.value}</span>
          <span className="text-xs text-muted-foreground text-center">{score.label}</span>
        </div>
      ))}
    </div>
  );
}




