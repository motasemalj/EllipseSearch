"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { 
  Globe, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  Clock,
  RefreshCw,
  FileSearch,
} from "lucide-react";
import { toast } from "sonner";
import type { CrawlStatus } from "@/types";

interface CrawlWebsiteButtonProps {
  brandId: string;
  domain: string;
  lastCrawledAt?: string | null;
}

interface CrawlStatusResponse {
  has_crawl: boolean;
  crawl_job_id?: string;
  status?: CrawlStatus;
  total_pages_crawled?: number;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
}

export function CrawlWebsiteButton({ brandId, domain, lastCrawledAt }: CrawlWebsiteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatusResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [maxPages, setMaxPages] = useState(50);

  // Fetch current crawl status
  const fetchCrawlStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/brands/crawl?brand_id=${brandId}`);
      if (response.ok) {
        const data = await response.json();
        setCrawlStatus(data);
        return data;
      }
    } catch (error) {
      console.error("Failed to fetch crawl status:", error);
    }
    return null;
  }, [brandId]);

  // Initial status fetch
  useEffect(() => {
    fetchCrawlStatus();
  }, [fetchCrawlStatus]);

  // Realtime updates for active crawls
  useEffect(() => {
    if (!isPolling) return;
    const supabase = createClient();

    const handleStatus = async () => {
      const status = await fetchCrawlStatus();
      if (status?.status === "completed" || status?.status === "failed") {
        setIsPolling(false);
        setIsLoading(false);

        if (status.status === "completed") {
          toast.success("Website crawl completed!", {
            description: `${status.total_pages_crawled} pages crawled successfully.`,
          });
          router.refresh();
        } else {
          toast.error("Crawl failed", {
            description: status.error_message || "An error occurred during crawling.",
          });
        }
      }
    };

    handleStatus();

    const channel = supabase
      .channel(`crawl-jobs-${brandId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crawl_jobs", filter: `brand_id=eq.${brandId}` },
        () => handleStatus()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isPolling, fetchCrawlStatus, router, brandId]);

  const handleStartCrawl = async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/brands/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: brandId,
          max_pages: maxPages,
          max_depth: 3,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          // Crawl already in progress
          toast.info("Crawl already in progress", {
            description: "Please wait for the current crawl to complete.",
          });
          setIsPolling(true);
        } else {
          throw new Error(data.error || "Failed to start crawl");
        }
        return;
      }

      toast.success("Crawl started!", {
        description: "We're crawling your website in the background. This may take a few minutes.",
      });

      setOpen(false);
      setIsPolling(true);
      
      // Update status
      setCrawlStatus({
        has_crawl: true,
        crawl_job_id: data.crawl_job_id,
        status: "pending",
        total_pages_crawled: 0,
      });

    } catch (error) {
      console.error("Failed to start crawl:", error);
      toast.error("Failed to start crawl", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
      setIsLoading(false);
    }
  };

  const isCrawling = crawlStatus?.status === "pending" || crawlStatus?.status === "crawling";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isCompleted = crawlStatus?.status === "completed";
  const isFailed = crawlStatus?.status === "failed";

  // Status indicator
  const StatusIndicator = () => {
    if (isCrawling || isPolling) {
      return (
        <div className="flex items-center gap-2 text-sm text-blue-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Crawling... {crawlStatus?.total_pages_crawled || 0} pages</span>
        </div>
      );
    }
    
    if (lastCrawledAt) {
      const crawledDate = new Date(lastCrawledAt);
      const daysSince = Math.floor((Date.now() - crawledDate.getTime()) / (1000 * 60 * 60 * 24));
      
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span>
            Last crawled {daysSince === 0 ? "today" : daysSince === 1 ? "yesterday" : `${daysSince} days ago`}
          </span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="w-4 h-4" />
        <span>Never crawled</span>
      </div>
    );
  };

  return (
    <div className="flex items-center gap-3">
      <StatusIndicator />
      
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button 
            variant={lastCrawledAt ? "outline" : "default"} 
            size="sm" 
            className="gap-2"
            disabled={isCrawling || isPolling}
          >
            {isCrawling || isPolling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Crawling...
              </>
            ) : lastCrawledAt ? (
              <>
                <RefreshCw className="w-4 h-4" />
                Re-crawl
              </>
            ) : (
              <>
                <Globe className="w-4 h-4" />
                Crawl Website
              </>
            )}
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSearch className="w-5 h-5" />
              Crawl Website
            </DialogTitle>
            <DialogDescription>
              Crawl your brand&apos;s website to gather &ldquo;Ground Truth&rdquo; content for enhanced AI analysis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Domain Display */}
            <div className="space-y-2">
              <Label>Website to Crawl</Label>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <span className="font-mono text-sm">{domain}</span>
              </div>
            </div>

            {/* Max Pages */}
            <div className="space-y-2">
              <Label htmlFor="max-pages">Maximum Pages</Label>
              <Input
                id="max-pages"
                type="number"
                value={maxPages}
                onChange={(e) => setMaxPages(Math.min(100, Math.max(1, parseInt(e.target.value) || 50)))}
                min={1}
                max={100}
              />
              <p className="text-xs text-muted-foreground">
                Limit: 1-100 pages. More pages = longer crawl time.
              </p>
            </div>

            {/* What will happen */}
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4 space-y-2">
              <h4 className="font-medium text-blue-600 dark:text-blue-400 text-sm">What happens next?</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">1.</span>
                  We&apos;ll crawl up to {maxPages} pages from your website
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">2.</span>
                  Extract content, titles, and descriptions
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">3.</span>
                  Use this data to improve AI visibility analysis
                </li>
              </ul>
            </div>

            {/* Previous crawl status */}
            {isFailed && crawlStatus?.error_message && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-600 dark:text-red-400">Previous crawl failed</p>
                    <p className="text-xs text-muted-foreground mt-1">{crawlStatus.error_message}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleStartCrawl} 
              disabled={isLoading}
              className="gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4" />
                  Start Crawl
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Separate component for showing crawl progress inline
export function CrawlProgressIndicator({ 
  status, 
  totalPages 
}: { 
  status: CrawlStatus; 
  totalPages: number;
}) {
  if (status === "completed") {
    return (
      <div className="flex items-center gap-2 text-green-600">
        <CheckCircle2 className="w-4 h-4" />
        <span className="text-sm font-medium">{totalPages} pages crawled</span>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex items-center gap-2 text-red-600">
        <AlertTriangle className="w-4 h-4" />
        <span className="text-sm font-medium">Crawl failed</span>
      </div>
    );
  }

  // Pending or crawling
  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
      <div className="flex-1">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Crawling...</span>
          <span className="font-medium">{totalPages} pages</span>
        </div>
        <Progress value={undefined} className="h-1.5" />
      </div>
    </div>
  );
}


