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
  // Handle both legacy (-1 to +1) and new (0 to 100) formats
  const rawNss = data?.net_sentiment_score;
  let nss: number;
  
  if (typeof rawNss === "number" && Number.isFinite(rawNss)) {
    // If value is between -1 and 1, it's legacy format - convert to 0-100
    if (rawNss >= -1 && rawNss <= 1) {
      nss = Math.round(((rawNss + 1) / 2) * 100);
    } else {
      // Already in 0-100 format
      nss = Math.round(rawNss);
    }
  } else {
    // Fallback based on simple sentiment
    nss = simpleSentiment === "positive" ? 75 :
          simpleSentiment === "negative" ? 25 : 50;
  }

  // Guardrails: avoid displaying weird edge values from partial data
  if (!Number.isFinite(nss) || nss < 0 || nss > 100) {
    nss = 50;
  }
  
  const label = data?.label || simpleSentiment || "neutral";
  const polarity = data?.polarity;
  
  const getColor = (score: number) => {
    if (score >= 60) return { text: "text-green-500", bg: "bg-green-500", ring: "ring-green-500/30" };
    if (score >= 40) return { text: "text-yellow-500", bg: "bg-yellow-500", ring: "ring-yellow-500/30" };
    return { text: "text-red-500", bg: "bg-red-500", ring: "ring-red-500/30" };
  };
  
  const colors = getColor(nss);
  
  const Icon = label === "positive" ? TrendingUp : label === "negative" ? TrendingDown : Minus;

  // If brand is not mentioned, show a friendly message without scores
  if (!brandMentioned) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-blue-500/10">
            <MessageSquare className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h3 className="font-semibold">Sentiment Analysis</h3>
            <p className="text-sm text-muted-foreground">Brand visibility check</p>
          </div>
        </div>
        <div className="text-center py-6 px-4">
          <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-lg font-medium text-foreground mb-1">Brand Not Mentioned</p>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Your brand wasn&apos;t referenced in this AI response. Sentiment analysis requires a brand mention to measure tone.
          </p>
        </div>
      </div>
    );
  }

  // If no sentiment data at all (but brand was mentioned), show pending state
  const hasSentimentData = data || simpleSentiment;
  if (!hasSentimentData) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-muted">
            <MessageSquare className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold">Sentiment Analysis</h3>
            <p className="text-sm text-muted-foreground">Analysis pending</p>
          </div>
        </div>
        <div className="text-center py-4">
          <p className="text-4xl font-bold text-muted-foreground">—</p>
          <p className="text-sm text-muted-foreground mt-1">Processing sentiment data...</p>
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
              <p className="text-sm text-muted-foreground capitalize">{label} tone towards your brand</p>
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
                {typeof polarity === "number"
                  ? `${polarity > 0 ? "+" : ""}${polarity.toFixed(2)}`
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Confidence</span>
              <span className="font-medium">
                {typeof data?.confidence === "number"
                  ? `${Math.round(data.confidence * 100)}%`
                  : "—"}
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


