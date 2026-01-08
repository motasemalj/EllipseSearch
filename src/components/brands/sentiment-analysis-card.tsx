"use client";

import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";
import type { SentimentAnalysis, Sentiment } from "@/types";

interface SentimentAnalysisCardProps {
  data?: SentimentAnalysis | null;
  simpleSentiment?: Sentiment;
  brandMentioned?: boolean;
}

export function SentimentAnalysisCard({
  data,
  simpleSentiment,
  brandMentioned = false,
}: SentimentAnalysisCardProps) {
  // Calculate display values
  const nss = data?.net_sentiment_score ?? (
    simpleSentiment === "positive" ? 75 :
    simpleSentiment === "negative" ? 25 : 50
  );
  
  const label = data?.label || simpleSentiment || "neutral";
  const polarity = data?.polarity ?? 0;
  
  const getColor = (score: number) => {
    if (score >= 60) return { text: "text-green-500", bg: "bg-green-500", ring: "ring-green-500/30" };
    if (score >= 40) return { text: "text-yellow-500", bg: "bg-yellow-500", ring: "ring-yellow-500/30" };
    return { text: "text-red-500", bg: "bg-red-500", ring: "ring-red-500/30" };
  };
  
  const colors = getColor(nss);
  
  const Icon = label === "positive" ? TrendingUp : label === "negative" ? TrendingDown : Minus;

  // If brand not mentioned, show different state
  if (!brandMentioned) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-muted">
            <MessageSquare className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold">Sentiment Analysis</h3>
            <p className="text-sm text-muted-foreground">Brand not mentioned</p>
          </div>
        </div>
        <div className="text-center py-4">
          <p className="text-4xl font-bold text-muted-foreground">—</p>
          <p className="text-sm text-muted-foreground mt-1">No data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${colors.bg}/20`}>
              <Icon className={`w-5 h-5 ${colors.text}`} />
            </div>
            <div>
              <h3 className="font-semibold">Net Sentiment Score</h3>
              <p className="text-sm text-muted-foreground capitalize">{label} overall tone</p>
            </div>
          </div>
        </div>

        {/* Score display */}
        <div className="flex items-center gap-6">
          <div className="relative">
            {/* Circular progress */}
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-muted/30"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - nss / 100)}`}
                strokeLinecap="round"
                className={colors.text}
                style={{ transition: "stroke-dashoffset 0.5s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-2xl font-bold ${colors.text}`}>{nss}</span>
            </div>
          </div>

          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Polarity</span>
              <span className="font-medium">
                {polarity > 0 ? "+" : ""}{polarity.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Confidence</span>
              <span className="font-medium">
                {Math.round((data?.confidence ?? 0.5) * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Praises and Concerns */}
      {(data?.praises?.length || data?.concerns?.length) && (
        <div className="border-t border-border">
          <div className="grid grid-cols-2 divide-x divide-border">
            {/* Praises */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <ThumbsUp className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-green-600 dark:text-green-400">Praises</span>
              </div>
              {data?.praises && data.praises.length > 0 ? (
                <ul className="space-y-1">
                  {data.praises.slice(0, 3).map((praise, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="text-green-500 mt-0.5">+</span>
                      <span className="line-clamp-2">{praise}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">None identified</p>
              )}
            </div>

            {/* Concerns */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <ThumbsDown className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-red-600 dark:text-red-400">Concerns</span>
              </div>
              {data?.concerns && data.concerns.length > 0 ? (
                <ul className="space-y-1">
                  {data.concerns.slice(0, 3).map((concern, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="text-red-500 mt-0.5">−</span>
                      <span className="line-clamp-2">{concern}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">None identified</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Warning for negative context */}
      {label === "negative" && brandMentioned && (
        <div className="border-t border-border p-4 bg-red-500/5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-600 dark:text-red-400">
              <span className="font-medium">Warning:</span> Your brand is mentioned but in a negative context. 
              Being visible with negative sentiment may be worse than not being mentioned.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

