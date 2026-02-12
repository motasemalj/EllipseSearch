"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  Copy, 
  Check, 
  Code2, 
  FileJson, 
  ChevronDown, 
  ChevronUp,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";
import type { SchemaFix, DetectedHallucination } from "@/types";

interface SchemaFixPanelProps {
  hallucination: DetectedHallucination;
  schemaFix?: SchemaFix | null;
  brandName: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function SchemaFixPanel({ hallucination, schemaFix, brandName }: SchemaFixPanelProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = async () => {
    if (!schemaFix?.json_ld) return;
    
    try {
      await navigator.clipboard.writeText(schemaFix.json_ld);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const severityColors = {
    critical: "border-red-500/50 bg-red-500/5",
    major: "border-amber-500/50 bg-amber-500/5",
    minor: "border-yellow-500/50 bg-yellow-500/5",
  };

  const typeLabels = {
    positive: "False Claim",
    negative: "Missing Info",
    misattribution: "Misattribution",
    outdated: "Outdated Info",
  };

  const typeIcons = {
    positive: "🚫",
    negative: "👻",
    misattribution: "🔀",
    outdated: "📅",
  };

  return (
    <div className={`rounded-2xl border-2 overflow-hidden ${severityColors[hallucination.severity]}`}>
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">{typeIcons[hallucination.type]}</span>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  hallucination.severity === "critical" ? "bg-red-500/20 text-red-600 dark:text-red-400" :
                  hallucination.severity === "major" ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" :
                  "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                }`}>
                  {hallucination.severity.toUpperCase()}
                </span>
                <span className="text-sm text-muted-foreground">
                  {typeLabels[hallucination.type]}
                </span>
              </div>
              <p className="font-medium">{hallucination.claim}</p>
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-medium text-foreground">Reality:</span> {hallucination.reality}
              </p>
            </div>
          </div>
          
          {schemaFix && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="shrink-0 gap-2"
            >
              <Code2 className="w-4 h-4" />
              Fix It
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
          )}
        </div>
      </div>

      {/* Recommendation */}
      <div className="px-4 py-3 bg-muted/30 border-b border-border/50">
        <div className="flex items-start gap-2">
          <Lightbulb className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">{hallucination.recommendation.title}</p>
            <p className="text-sm text-muted-foreground">{hallucination.recommendation.description}</p>
          </div>
        </div>
      </div>

      {/* Schema Fix Code */}
      {schemaFix && expanded && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileJson className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{schemaFix.schema_type} Schema</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="gap-2 text-xs"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy Code
                </>
              )}
            </Button>
          </div>

          <div className="schema-code">
            <pre className="text-xs overflow-x-auto max-h-[300px]">
              <code>{schemaFix.json_ld}</code>
            </pre>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
            <AlertTriangle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{schemaFix.placement_hint}</span>
              <br />
              {schemaFix.fixes_issue}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface SchemaFixListProps {
  hallucinations: DetectedHallucination[];
  brandName: string;
  brandDomain: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function SchemaFixList({ hallucinations, brandName, brandDomain }: SchemaFixListProps) {
  if (!hallucinations || hallucinations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-amber-500/20">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <h3 className="font-semibold">Hallucinations Detected</h3>
          <p className="text-sm text-muted-foreground">
            {hallucinations.length} issue{hallucinations.length !== 1 ? "s" : ""} found. Use the &ldquo;Fix It&rdquo; button to get copy-paste Schema markup.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {hallucinations.map((h, i) => (
          <SchemaFixPanel
            key={i}
            hallucination={h}
            schemaFix={h.recommendation?.schema_fix}
            brandName={brandName}
          />
        ))}
      </div>
    </div>
  );
}

