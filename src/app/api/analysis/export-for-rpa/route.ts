/**
 * Export Prompts for RPA
 * 
 * Exports prompts in CSV format for use with the external Python RPA script.
 * 
 * Usage:
 * GET /api/analysis/export-for-rpa?brand_id=xxx
 * GET /api/analysis/export-for-rpa?brand_id=xxx&prompt_set_id=yyy
 * GET /api/analysis/export-for-rpa?brand_id=xxx&engines=chatgpt,gemini
 * 
 * Returns CSV:
 * id,text,engine,brand_id,brand_domain,brand_name
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupportedEngine } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Get query params
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get("brand_id");
    const promptSetId = searchParams.get("prompt_set_id");
    const enginesParam = searchParams.get("engines");
    
    if (!brandId) {
      return NextResponse.json(
        { error: "Missing brand_id parameter" },
        { status: 400 }
      );
    }
    
    // Verify access to brand
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("*")
      .eq("id", brandId)
      .single();
    
    if (brandError || !brand || brand.organization_id !== profile?.organization_id) {
      return NextResponse.json(
        { error: "Brand not found or access denied" },
        { status: 404 }
      );
    }
    
    // Get prompts
    let query = supabase
      .from("prompts")
      .select("id, text")
      .eq("brand_id", brandId);
    
    if (promptSetId) {
      query = query.eq("prompt_set_id", promptSetId);
    }
    
    const { data: prompts, error: promptsError } = await query;
    
    if (promptsError) {
      return NextResponse.json(
        { error: promptsError.message },
        { status: 500 }
      );
    }
    
    if (!prompts || prompts.length === 0) {
      return NextResponse.json(
        { error: "No prompts found" },
        { status: 404 }
      );
    }
    
    // Parse engines (default to all)
    const engines: SupportedEngine[] = enginesParam 
      ? enginesParam.split(",") as SupportedEngine[]
      : ["chatgpt", "gemini", "perplexity", "grok"];
    
    // Build CSV rows
    const rows: string[] = [];
    
    // Header
    rows.push("id,text,engine,brand_id,brand_domain,brand_name");
    
    // Data rows - one per prompt per engine
    for (const prompt of prompts) {
      for (const engine of engines) {
        // Escape text for CSV (handle commas, quotes, newlines)
        const escapedText = `"${prompt.text.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        const escapedName = `"${brand.name.replace(/"/g, '""')}"`;
        
        rows.push(`${prompt.id},${escapedText},${engine},${brandId},${brand.domain},${escapedName}`);
      }
    }
    
    const csv = rows.join("\n");
    
    // Return as CSV file
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="rpa_prompts_${brandId.slice(0, 8)}.csv"`,
      },
    });
    
  } catch (error) {
    console.error("Export for RPA error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

