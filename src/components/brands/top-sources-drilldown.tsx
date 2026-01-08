"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";

export type TopSourceItem = {
  domain: string;
  citations: number;
  urls: string[];
};

export function TopSourcesDrilldown({
  items,
  title = "Top winning sources",
  description = "These domains are frequently cited by AI engines instead of your brand. Click a domain to see the exact URLs cited.",
}: {
  items: TopSourceItem[];
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeDomain, setActiveDomain] = useState<TopSourceItem | null>(null);

  const openDomain = (item: TopSourceItem) => {
    setActiveDomain(item);
    setOpen(true);
  };

  const sorted = useMemo(() => [...items].sort((a, b) => b.citations - a.citations), [items]);

  const copyAll = async () => {
    if (!activeDomain) return;
    try {
      await navigator.clipboard.writeText(activeDomain.urls.join("\n"));
      toast.success("Copied URLs");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="space-y-2">
        {sorted.map((item, i) => (
          <button
            key={item.domain}
            onClick={() => openDomain(item)}
            className="w-full flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/35 transition-colors text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs font-medium text-muted-foreground w-6">{i + 1}.</span>
              <span className="font-medium truncate">{item.domain}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="tabular-nums">{item.citations}</span>
              <span>citations</span>
            </div>
          </button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{activeDomain?.domain || "Source"}</DialogTitle>
            <DialogDescription>
              URLs cited ({activeDomain?.urls.length || 0}). Use these to understand what content is winning, and where you need coverage.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Total citations: <span className="font-medium text-foreground">{activeDomain?.citations ?? 0}</span>
            </p>
            <Button variant="outline" size="sm" className="gap-2" onClick={copyAll} disabled={!activeDomain}>
              <Copy className="w-4 h-4" />
              Copy URLs
            </Button>
          </div>

          <div className="max-h-[50vh] overflow-auto rounded-xl border border-border">
            <div className="divide-y divide-border">
              {(activeDomain?.urls || []).map((url) => (
                <div key={url} className="p-3 flex items-start justify-between gap-3">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-foreground hover:underline break-all"
                  >
                    {url}
                  </a>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}



