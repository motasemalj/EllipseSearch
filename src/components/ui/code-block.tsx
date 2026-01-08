"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Copy } from "lucide-react";

export function CodeBlock({
  code,
  language = "bash",
  className,
}: {
  code: string;
  language?: string;
  className?: string;
}) {
  const trimmed = useMemo(() => code.trimEnd(), [code]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(trimmed);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className={cn("relative rounded-xl border border-border bg-muted/30", className)}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground">{language}</span>
        <Button variant="ghost" size="sm" className="gap-2" onClick={onCopy}>
          <Copy className="w-4 h-4" />
          Copy
        </Button>
      </div>
      <pre className="overflow-auto p-4 text-sm leading-relaxed">
        <code className="font-mono text-foreground">{trimmed}</code>
      </pre>
    </div>
  );
}


