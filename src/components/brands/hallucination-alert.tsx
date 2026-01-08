"use client";

import { useState } from "react";
import { 
  AlertTriangle, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp,
  Lightbulb,
  AlertCircle,
  XCircle,
  Clock,
  Eye,
} from "lucide-react";
import type { HallucinationAnalysis, DetectedHallucination } from "@/types";

interface HallucinationAlertProps {
  analysis: HallucinationAnalysis;
  compact?: boolean;
}

const SEVERITY_CONFIG = {
  critical: {
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: XCircle,
  },
  major: {
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    icon: AlertTriangle,
  },
  minor: {
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    icon: AlertCircle,
  },
};

const TYPE_CONFIG = {
  positive: {
    label: "False Claim",
    icon: AlertTriangle,
    description: "AI stated something that isn't true",
  },
  negative: {
    label: "Invisible Content",
    icon: Eye,
    description: "AI couldn't find information that exists on your site",
  },
  misattribution: {
    label: "Misattribution",
    icon: AlertCircle,
    description: "AI attributed wrong category/product to your brand",
  },
  outdated: {
    label: "Outdated Info",
    icon: Clock,
    description: "AI used old information that's no longer accurate",
  },
};

export function HallucinationAlert({ analysis, compact = false }: HallucinationAlertProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);

  if (!analysis.has_hallucinations) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
        <CheckCircle2 className="w-5 h-5 text-green-500" />
        <div>
          <span className="font-medium text-green-600 dark:text-green-400">
            No Hallucinations Detected
          </span>
          <span className="text-sm text-muted-foreground ml-2">
            Accuracy: {analysis.accuracy_score}%
          </span>
        </div>
      </div>
    );
  }

  const criticalCount = analysis.hallucinations.filter(h => h.severity === "critical").length;
  const majorCount = analysis.hallucinations.filter(h => h.severity === "major").length;

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-red-500/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/20">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-red-600 dark:text-red-400">
              {analysis.hallucinations.length} Hallucination{analysis.hallucinations.length !== 1 ? "s" : ""} Detected
            </h3>
            <p className="text-sm text-muted-foreground">
              {criticalCount > 0 && <span className="text-red-500 font-medium">{criticalCount} critical</span>}
              {criticalCount > 0 && majorCount > 0 && ", "}
              {majorCount > 0 && <span className="text-orange-500">{majorCount} major</span>}
              {" · "}
              Accuracy: {analysis.accuracy_score}%
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        )}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-red-500/20 p-4 space-y-4">
          {analysis.hallucinations.map((hallucination, index) => (
            <HallucinationCard key={index} hallucination={hallucination} />
          ))}
        </div>
      )}
    </div>
  );
}

function HallucinationCard({ hallucination }: { hallucination: DetectedHallucination }) {
  const severity = SEVERITY_CONFIG[hallucination.severity];
  const type = TYPE_CONFIG[hallucination.type];
  const SeverityIcon = severity.icon;

  return (
    <div className={`rounded-lg border ${severity.border} ${severity.bg} p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <SeverityIcon className={`w-4 h-4 ${severity.color}`} />
          <span className={`text-sm font-medium ${severity.color} uppercase`}>
            {hallucination.severity}
          </span>
          <span className="text-sm text-muted-foreground">·</span>
          <span className="text-sm text-muted-foreground">
            {type.label}
          </span>
        </div>
      </div>

      {/* Claim vs Reality */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            What AI Said
          </p>
          <p className="text-sm bg-card/50 rounded-lg p-2 border border-border">
            &ldquo;{hallucination.claim}&rdquo;
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Reality (from your website)
          </p>
          <p className="text-sm bg-green-500/10 rounded-lg p-2 border border-green-500/20 text-green-700 dark:text-green-300">
            {hallucination.reality}
          </p>
        </div>
      </div>

      {/* Fix Recommendation */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Lightbulb className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
              {hallucination.recommendation.title}
            </p>
            <p className="text-sm text-muted-foreground">
              {hallucination.recommendation.specific_fix}
            </p>
            {hallucination.recommendation.affected_element && (
              <p className="text-xs text-muted-foreground">
                Affected: <span className="font-mono bg-muted px-1 py-0.5 rounded">{hallucination.recommendation.affected_element}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Mini badge for table views
export function HallucinationBadge({ analysis }: { analysis?: HallucinationAnalysis }) {
  if (!analysis) return null;

  if (!analysis.has_hallucinations) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-medium">
        <CheckCircle2 className="w-3 h-3" />
        Accurate
      </span>
    );
  }

  const criticalCount = analysis.hallucinations.filter(h => h.severity === "critical").length;

  if (criticalCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-medium">
        <XCircle className="w-3 h-3" />
        {criticalCount} Critical
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs font-medium">
      <AlertTriangle className="w-3 h-3" />
      {analysis.hallucinations.length} Issue{analysis.hallucinations.length !== 1 ? "s" : ""}
    </span>
  );
}


