"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  Building2, 
  ExternalLink, 
  AlertCircle, 
  CheckCircle2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  Plus,
  Lightbulb,
  Copy,
  Check,
} from "lucide-react";
import type { EntityConfidence } from "@/types";

interface EntityConfidenceCardProps {
  entityData?: EntityConfidence | null;
  brandName: string;
  brandDomain: string;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function EntityConfidenceCard({
  entityData,
  brandName,
  brandDomain,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isLoading: _isLoading,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onRefresh: _onRefresh,
}: EntityConfidenceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Determine status
  const status = !entityData || entityData.confidence_score < 0
    ? "unknown"
    : entityData.is_recognized_entity
      ? entityData.confidence_score >= 70 ? "strong" : "partial"
      : "not_recognized";

  const statusConfig = {
    unknown: {
      icon: HelpCircle,
      color: "text-muted-foreground",
      bgColor: "bg-muted/30",
      borderColor: "border-muted-foreground/20",
      label: "Unknown",
      description: "Entity check not performed",
    },
    not_recognized: {
      icon: AlertCircle,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/30",
      label: "Not Recognized",
      description: "Your brand is NOT an Entity in the Knowledge Graph",
    },
    partial: {
      icon: AlertCircle,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/30",
      label: "Partially Recognized",
      description: "Entity found but profile incomplete",
    },
    strong: {
      icon: CheckCircle2,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/30",
      label: "Recognized Entity",
      description: "Your brand is a recognized Entity",
    },
  };

  const config = statusConfig[status];

  const handleCopySchema = async () => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": brandName,
      "url": `https://${brandDomain}`,
      "sameAs": entityData?.same_as_links || [],
    };
    
    const jsonLd = `<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>`;
    
    try {
      await navigator.clipboard.writeText(jsonLd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className={`rounded-2xl border-2 overflow-hidden ${config.borderColor} ${config.bgColor}`}>
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl ${config.bgColor}`}>
              <Building2 className={`w-6 h-6 ${config.color}`} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold">Entity Confidence</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
                  {config.label}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{config.description}</p>
              
              {entityData && entityData.confidence_score >= 0 && (
                <div className="mt-3">
                  {/* Confidence meter */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          status === "strong" ? "bg-green-500" :
                          status === "partial" ? "bg-amber-500" :
                          "bg-red-500"
                        }`}
                        style={{ width: `${entityData.confidence_score}%` }}
                      />
                    </div>
                    <span className={`text-lg font-bold ${config.color}`}>
                      {entityData.confidence_score}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && entityData && (
        <div className="border-t border-border/50">
          {/* Entity details */}
          {entityData.entity_type && (
            <div className="px-5 py-3 border-b border-border/50 bg-background/50">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Entity Type:</span>
                <span className="font-medium">{entityData.entity_type}</span>
              </div>
              {entityData.entity_description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {entityData.entity_description}
                </p>
              )}
            </div>
          )}

          {/* Same-as links */}
          {entityData.same_as_links && entityData.same_as_links.length > 0 && (
            <div className="px-5 py-3 border-b border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <LinkIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Linked Profiles</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {entityData.same_as_links.map((link, i) => {
                  let domain = link;
                  try {
                    domain = new URL(link).hostname.replace("www.", "");
                  } catch {}
                  return (
                    <a
                      key={i}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted hover:bg-muted/80 text-xs transition-colors"
                    >
                      {domain}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Missing links */}
          {entityData.missing_links && entityData.missing_links.length > 0 && (
            <div className="px-5 py-3 border-b border-border/50 bg-amber-500/5">
              <div className="flex items-center gap-2 mb-2">
                <Plus className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  Missing Profiles
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {entityData.missing_links.map((platform, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs border border-amber-500/20"
                  >
                    {platform}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recommendation */}
          {entityData.recommendation && (
            <div className="px-5 py-3 border-b border-border/50">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">{entityData.recommendation}</p>
              </div>
            </div>
          )}

          {/* Action: Copy Schema */}
          <div className="px-5 py-3 bg-muted/30 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Add <code className="bg-muted px-1 rounded">sameAs</code> Schema to link your profiles
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopySchema}
              className="gap-2"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-green-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy Schema
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

