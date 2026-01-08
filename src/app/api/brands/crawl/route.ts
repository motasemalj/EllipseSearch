import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tasks } from "@trigger.dev/sdk/v3";
import type { CrawlBrandInput, CrawlStatus } from "@/types";

/**
 * POST /api/brands/crawl
 * Start a new website crawl for a brand
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    const { 
      brand_id, 
      max_pages = 50, 
      max_depth = 3,
      include_paths = [],
      exclude_paths = [],
    } = body as {
      brand_id: string;
      max_pages?: number;
      max_depth?: number;
      include_paths?: string[];
      exclude_paths?: string[];
    };

    if (!brand_id) {
      return NextResponse.json(
        { error: "brand_id is required" },
        { status: 400 }
      );
    }

    // Verify user has access to this brand
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const { data: brand } = await supabase
      .from("brands")
      .select("*")
      .eq("id", brand_id)
      .single();

    if (!brand || brand.organization_id !== profile?.organization_id) {
      return NextResponse.json(
        { error: "Brand not found or access denied" },
        { status: 404 }
      );
    }

    // Check if there's already a crawl in progress
    const { data: existingCrawl } = await supabase
      .from("crawl_jobs")
      .select("id, status")
      .eq("brand_id", brand_id)
      .in("status", ["pending", "crawling"])
      .single();

    if (existingCrawl) {
      return NextResponse.json(
        { 
          error: "A crawl is already in progress for this brand",
          crawl_job_id: existingCrawl.id,
          status: existingCrawl.status,
        },
        { status: 409 }
      );
    }

    // Construct start URL from brand domain
    let startUrl = brand.domain;
    if (!startUrl.startsWith("http://") && !startUrl.startsWith("https://")) {
      startUrl = `https://${startUrl}`;
    }

    // Create crawl job record
    const { data: crawlJob, error: createError } = await supabase
      .from("crawl_jobs")
      .insert({
        brand_id,
        status: "pending" as CrawlStatus,
        start_url: startUrl,
        max_pages,
        max_depth,
        include_paths,
        exclude_paths,
      })
      .select()
      .single();

    if (createError || !crawlJob) {
      console.error("Failed to create crawl job:", createError);
      return NextResponse.json(
        { error: "Failed to create crawl job" },
        { status: 500 }
      );
    }

    // Trigger the background job
    const payload: CrawlBrandInput = {
      brand_id,
      crawl_job_id: crawlJob.id,
      start_url: startUrl,
      max_pages,
      max_depth,
      include_paths,
      exclude_paths,
    };

    try {
      const handle = await tasks.trigger("crawl-brand-website", payload);
      console.log("Triggered crawl job:", handle.id);
    } catch (triggerError) {
      console.error("Failed to trigger crawl job:", triggerError);
      
      // Update job as failed
      await supabase
        .from("crawl_jobs")
        .update({ 
          status: "failed", 
          error_message: `Failed to trigger job: ${triggerError instanceof Error ? triggerError.message : 'Unknown error'}` 
        })
        .eq("id", crawlJob.id);

      return NextResponse.json(
        { error: "Failed to start crawl job" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      crawl_job_id: crawlJob.id,
      status: "pending",
      message: "Crawl started. Poll /api/brands/crawl/status for updates.",
    });

  } catch (error) {
    console.error("Crawl API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/brands/crawl?brand_id=xxx
 * Get the latest crawl status for a brand
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get brand_id from query params
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get("brand_id");
    const crawlJobId = searchParams.get("crawl_job_id");

    if (!brandId && !crawlJobId) {
      return NextResponse.json(
        { error: "brand_id or crawl_job_id is required" },
        { status: 400 }
      );
    }

    // Verify user has access
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    // Build query
    let query = supabase
      .from("crawl_jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (crawlJobId) {
      query = query.eq("id", crawlJobId);
    } else if (brandId) {
      // Verify access to brand
      const { data: brand } = await supabase
        .from("brands")
        .select("organization_id")
        .eq("id", brandId)
        .single();

      if (!brand || brand.organization_id !== profile?.organization_id) {
        return NextResponse.json(
          { error: "Brand not found or access denied" },
          { status: 404 }
        );
      }

      query = query.eq("brand_id", brandId).limit(1);
    }

    const { data: crawlJobs, error } = await query;

    if (error) {
      console.error("Error fetching crawl jobs:", error);
      return NextResponse.json(
        { error: "Failed to fetch crawl status" },
        { status: 500 }
      );
    }

    if (!crawlJobs || crawlJobs.length === 0) {
      return NextResponse.json({
        has_crawl: false,
        message: "No crawl jobs found for this brand",
      });
    }

    const crawlJob = crawlJobs[0];

    return NextResponse.json({
      has_crawl: true,
      crawl_job_id: crawlJob.id,
      status: crawlJob.status,
      start_url: crawlJob.start_url,
      total_pages_crawled: crawlJob.total_pages_crawled,
      credits_used: crawlJob.credits_used,
      started_at: crawlJob.started_at,
      completed_at: crawlJob.completed_at,
      error_message: crawlJob.error_message,
      created_at: crawlJob.created_at,
    });

  } catch (error) {
    console.error("Crawl status API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


