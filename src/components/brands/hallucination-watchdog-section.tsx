"use client";

import { 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  XCircle, 
  CheckCircle2,
  DollarSign,
  Box,
  MapPin,
  HelpCircle,
  Lightbulb,
  ExternalLink,
  Crown,
  Lock,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface HallucinationItem {
  type: "pricing" | "feature" | "availability" | "factual" | "negative";
  severity: "critical" | "major" | "minor";
  claim: string;
  reality: string;
  source_url?: string;
  recommendation: {
    title: string;
    description: string;
    specific_fix: string;
  };
}

interface HallucinationResult {
  has_hallucinations: boolean;
  accuracy_score: number;
  hallucinations: HallucinationItem[];
  summary: string;
}

interface HallucinationWatchdogData {
  enabled: boolean;
  result: HallucinationResult | null;
  no_ground_truth?: boolean;
}

interface HallucinationWatchdogSectionProps {
  data?: HallucinationWatchdogData;
  brandId?: string;
  userTier?: string;
}

const severityConfig = {
  critical: {
    icon: XCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    label: "Critical",
    labelBg: "bg-red-500",
  },
  major: {
    icon: AlertTriangle,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    label: "Major",
    labelBg: "bg-amber-500",
  },
  minor: {
    icon: HelpCircle,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
    label: "Minor",
    labelBg: "bg-yellow-500",
  },
};

const typeConfig = {
  pricing: {
    icon: DollarSign,
    label: "Pricing Error",
    description: "AI stated incorrect pricing information",
  },
  feature: {
    icon: Box,
    label: "Feature Mismatch",
    description: "AI claimed features that don't exist or missed existing ones",
  },
  availability: {
    icon: MapPin,
    label: "Availability Issue",
    description: "AI provided wrong availability or region information",
  },
  factual: {
    icon: AlertTriangle,
    label: "Factual Error",
    description: "AI stated incorrect facts about your brand",
  },
  negative: {
    icon: ShieldAlert,
    label: "Missing Information",
    description: "AI couldn't find information that exists on your website",
  },
  // Backend hallucination detector types (RPA + API)
  positive: {
    icon: AlertTriangle,
    label: "Inaccurate Claim",
    description: "AI stated incorrect or fabricated information",
  },
  misattribution: {
    icon: AlertTriangle,
    label: "Misattribution",
    description: "AI attributed wrong products/services to your brand",
  },
  outdated: {
    icon: AlertTriangle,
    label: "Outdated Info",
    description: "AI used old or outdated information",
  },
};

function normalizeHallucinationType(type: string): keyof typeof typeConfig {
  if (type in typeConfig) return type as keyof typeof typeConfig;
  // Fallbacks for unexpected values
  return "factual";
}

// Example hallucinations to show in locked state
const exampleHallucinations = [
  {
    type: "pricing" as const,
    claim: "Starting price is $49/month...",
    reality: "Your actual pricing starts at $99/month",
  },
  {
    type: "feature" as const,
    claim: "Includes free API access...",
    reality: "API access is only in Pro plan",
  },
  {
    type: "availability" as const,
    claim: "Not available in UAE...",
    reality: "You launched in UAE in 2024",
  },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function HallucinationWatchdogSection({ data, brandId, userTier }: HallucinationWatchdogSectionProps) {
  const isPro = userTier === "pro" || userTier === "agency";
  
  // Determine what state to show:
  // 1. Not Pro and no data/result -> Show upgrade prompt
  // 2. Pro but detection wasn't enabled (data.enabled = false) -> Show "enable in next analysis"
  // 3. Pro and detection enabled but no ground truth data -> Show "need to crawl website"
  // 4. Pro and detection enabled with result -> Show results
  
  const showUpgradePrompt = !isPro && (!data?.result);
  // Pro policy: hallucination detection is ALWAYS enabled.
  // If there is no result, we show a "run an analysis" state (never "Enable in your next analysis").
  const proNoResult = isPro && (!data?.result);
  const wasEnabledButNoGroundTruth = proNoResult && data?.no_ground_truth === true;
  const wasEnabledButNoResult = proNoResult && !data?.no_ground_truth;
  
  // Show locked/upgrade state
  if (showUpgradePrompt || wasEnabledButNoGroundTruth || wasEnabledButNoResult) {
    return (
      <Card className="border-2 border-dashed border-amber-500/30 bg-gradient-to-br from-amber-950/10 via-background to-orange-950/10 overflow-hidden relative" id="watchdog">
        {/* Decorative gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/5 pointer-events-none" />
        
        <CardHeader className="relative">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30">
              <ShieldAlert className="w-6 h-6 text-amber-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">AI Hallucination Detection</CardTitle>
                <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold">
                  <Crown className="w-3 h-3 mr-1" />
                  PRO
                </Badge>
              </div>
              <CardDescription>
                {showUpgradePrompt 
                  ? "Upgrade to Pro to unlock this feature"
                  : wasEnabledButNoGroundTruth
                    ? "Website crawl data needed for detection"
                    : "Always enabled on Pro"
                }
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="relative space-y-4">
          {/* Value Proposition */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
            <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Don&apos;t just track if AI talks about you. Track what it says.
            </h4>
            <p className="text-sm text-muted-foreground">
              We show you when ChatGPT lies about your pricing, features, or availability—so you can fix it before you lose sales.
            </p>
          </div>

          {/* Example Hallucinations (Blurred/Locked) */}
          <div className="relative">
            <div className="space-y-3 opacity-50 blur-[2px] pointer-events-none select-none">
              {exampleHallucinations.map((example, index) => {
                const TypeIcon = typeConfig[example.type].icon;
                return (
                  <div 
                    key={index}
                    className="p-4 rounded-xl border border-red-500/20 bg-red-500/5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-red-500/10">
                        <TypeIcon className="w-4 h-4 text-red-500" />
                      </div>
                      <div className="flex-1 space-y-2">
                        <Badge variant="secondary" className="gap-1 text-xs">
                          {typeConfig[example.type].label}
                        </Badge>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-2 rounded bg-red-500/10 text-xs">
                            <span className="text-red-400">AI said:</span> {example.claim}
                          </div>
                          <div className="p-2 rounded bg-green-500/10 text-xs">
                            <span className="text-green-400">Reality:</span> {example.reality}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Overlay with CTA */}
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-background via-background/80 to-transparent">
              <div className="text-center p-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-8 h-8 text-amber-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  {showUpgradePrompt 
                    ? "Unlock Hallucination Detection" 
                    : wasEnabledButNoGroundTruth
                      ? "Gathering Website Data"
                      : wasEnabledButNoResult
                        ? "Hallucination Detection is Active"
                        : "Hallucination Detection is Active"
                  }
                </h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                  {showUpgradePrompt 
                    ? "Upgrade to Pro to detect when AI lies about your brand's pricing, features, and availability."
                    : wasEnabledButNoGroundTruth
                      ? "Your website will be crawled automatically on the next analysis run. The crawl provides the ground truth needed to verify AI claims."
                      : "This feature runs automatically for Pro accounts. Run a new analysis to generate the hallucination report for this prompt."
                  }
                </p>
                {showUpgradePrompt ? (
                  <Link href="/billing">
                    <Button className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white">
                      <Crown className="w-4 h-4 mr-2" />
                      Upgrade to Pro
                    </Button>
                  </Link>
                ) : wasEnabledButNoGroundTruth ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Run a new analysis — website crawl will start automatically
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Run a new analysis — hallucination detection will run automatically
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Feature Highlights */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            {[
              { icon: DollarSign, label: "Pricing Errors", desc: "Wrong prices" },
              { icon: Box, label: "Feature Lies", desc: "Missing features" },
              { icon: MapPin, label: "Availability", desc: "Wrong regions" },
            ].map((feature, index) => (
              <div key={index} className="text-center p-3 rounded-lg bg-muted/30">
                <feature.icon className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                <p className="text-xs font-medium">{feature.label}</p>
                <p className="text-xs text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // At this point, data exists, was enabled, and has a result
  // (all other cases are handled in the first if block)
  if (!data || !data.result) {
    // This should never happen, but TypeScript needs this check
    return null;
  }

  const result = data.result;
  const hasIssues = result.has_hallucinations;

  return (
    <Card className={`border-2 ${hasIssues ? "border-red-500/30 bg-red-500/5" : "border-green-500/30 bg-green-500/5"}`} id="watchdog">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${hasIssues ? "bg-red-500/10" : "bg-green-500/10"}`}>
            {hasIssues ? (
              <ShieldAlert className="w-6 h-6 text-red-500" />
            ) : (
              <ShieldCheck className="w-6 h-6 text-green-500" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">AI Hallucination Detection</CardTitle>
              <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold">
                <Crown className="w-3 h-3 mr-1" />
                PRO
              </Badge>
            </div>
            <CardDescription>
              {hasIssues 
                ? `${result.hallucinations.length} issue${result.hallucinations.length === 1 ? "" : "s"} detected`
                : "No hallucinations detected"
              }
            </CardDescription>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-bold ${
              result.accuracy_score >= 90 ? "text-green-500" :
              result.accuracy_score >= 70 ? "text-amber-500" : "text-red-500"
            }`}>
              {result.accuracy_score}%
            </div>
            <div className="text-xs text-muted-foreground">Accuracy Score</div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className={`p-4 rounded-xl ${hasIssues ? "bg-red-500/10" : "bg-green-500/10"}`}>
          <p className="text-sm">{result.summary}</p>
        </div>

        {/* Hallucination Items */}
        {hasIssues && (
          <div className="space-y-3">
            {result.hallucinations.map((item, index) => {
              const severity = severityConfig[item.severity];
              const type = typeConfig[normalizeHallucinationType(item.type)];
              const SeverityIcon = severity.icon;
              const TypeIcon = type.icon;

              return (
                <div 
                  key={index}
                  className={`p-4 rounded-xl border-2 ${severity.borderColor} ${severity.bgColor}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${severity.bgColor}`}>
                      <SeverityIcon className={`w-5 h-5 ${severity.color}`} />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="gap-1">
                          <TypeIcon className="w-3 h-3" />
                          {type.label}
                        </Badge>
                        <Badge className={`${severity.labelBg} text-white`}>
                          {severity.label}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                            What AI Said
                          </p>
                          <p className="text-sm bg-background/50 p-2 rounded-lg border border-red-500/20 text-red-600 dark:text-red-400">
                            &ldquo;{item.claim}&rdquo;
                          </p>
                        </div>
                        
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                            The Reality
                          </p>
                          <p className="text-sm bg-background/50 p-2 rounded-lg border border-green-500/20 text-green-600 dark:text-green-400">
                            {item.reality}
                            {item.source_url && (
                              <a 
                                href={item.source_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 ml-2 text-primary hover:underline"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Source
                              </a>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Recommendation */}
                      <div className="mt-3 p-3 rounded-lg bg-background/50 border">
                        <div className="flex items-center gap-2 text-sm font-medium mb-2">
                          <Lightbulb className="w-4 h-4 text-amber-500" />
                          {item.recommendation.title}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {item.recommendation.description}
                        </p>
                        <div className="text-sm bg-primary/5 p-2 rounded border-l-2 border-primary">
                          {item.recommendation.specific_fix}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* All Clear State */}
        {!hasIssues && (
          <div className="flex items-center gap-4 p-4 rounded-xl bg-green-500/10">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
            <div>
              <p className="font-medium text-green-600 dark:text-green-400">
                AI responses are accurate!
              </p>
              <p className="text-sm text-muted-foreground">
                No hallucinations detected in this simulation. The AI&apos;s statements about your brand match your website data.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
