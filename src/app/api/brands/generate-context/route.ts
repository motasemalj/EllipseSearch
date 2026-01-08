import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateBrandContext, scrapeWebsiteContent } from "@/lib/ai/brand-context-generator";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { domain, name } = body as { domain: string; name: string };

    if (!domain || !name) {
      return NextResponse.json(
        { error: "Domain and name are required" },
        { status: 400 }
      );
    }

    // Clean domain
    const cleanDomain = domain
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");

    // Try to scrape website content for better context
    let websiteContent: string | null = null;
    try {
      websiteContent = await scrapeWebsiteContent(cleanDomain);
    } catch (error) {
      console.log("Website scraping skipped:", error);
    }

    // Generate brand context using AI
    const context = await generateBrandContext({
      domain: cleanDomain,
      name,
      websiteContent: websiteContent || undefined,
    });

    return NextResponse.json({
      success: true,
      context,
    });
  } catch (error) {
    console.error("Generate context error:", error);
    return NextResponse.json(
      { error: "Failed to generate brand context" },
      { status: 500 }
    );
  }
}


