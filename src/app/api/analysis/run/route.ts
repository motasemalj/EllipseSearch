import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tasks } from "@trigger.dev/sdk/v3";
import type { RunAnalysisInput, SupportedEngine, SupportedLanguage, SupportedRegion } from "@/types";
import { isRpaAvailable } from "@/lib/rpa/status";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const authHeader = request.headers.get("authorization");
    const bearer =
      authHeader && authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice("bearer ".length).trim()
        : undefined;

    const {
      data: { user: cookieUser },
    } = await supabase.auth.getUser();

    // If cookie-based auth failed, allow Bearer Supabase access token (API access)
    let authedUser = cookieUser;
    if (!authedUser && bearer) {
      const { data } = await supabase.auth.getUser(bearer);
      authedUser = data.user;
    }

    if (!authedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    const { 
      brand_id, 
      keyword_set_id, // Legacy support
      prompt_set_id,  // New name
      prompt_ids,     // For individual prompts (no set required)
      engines, 
      language,
      region = "global", // Default to global if not specified
      enable_hallucination_watchdog,
      simulation_mode, // Optional: 'api' to force API mode for ChatGPT
      schedule, // New: schedule frequency for recurring analysis
    } = body as {
      brand_id: string;
      keyword_set_id?: string;
      prompt_set_id?: string;
      prompt_ids?: string[];
      engines: SupportedEngine[];
      language: SupportedLanguage;
      region?: SupportedRegion;
      enable_hallucination_watchdog?: boolean;
      simulation_mode?: 'api' | 'rpa' | 'hybrid';
      schedule?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
    };
    
    // Log what we received
    console.log(`[Analysis API] Request: engines=${engines.join(",")}, hallucination_watchdog=${enable_hallucination_watchdog}, simulation_mode=${simulation_mode}`);
    
    // ═══════════════════════════════════════════════════════════════
    // ENGINE ROUTING - RPA is DEFAULT for ChatGPT, API fallback if offline
    // ═══════════════════════════════════════════════════════════════
    // ChatGPT uses RPA (real browser) by default for best quality
    // Falls back to API mode automatically if RPA worker is offline
    // User can force API mode by passing simulation_mode: 'api'
    // Other engines (Gemini, Perplexity, Grok) always use API mode
    // ═══════════════════════════════════════════════════════════════
    
    // If user explicitly requested API mode, skip RPA check
    const forceApiMode = simulation_mode === 'api';
    
    let rpaStatus = { available: false, workerCount: 0, engines: [] as string[] };
    if (!forceApiMode) {
      rpaStatus = await isRpaAvailable();
    }
    
    // Log RPA status for debugging
    console.log(`[Analysis API] RPA Status: available=${rpaStatus.available}, workers=${rpaStatus.workerCount}, engines=[${rpaStatus.engines.join(",")}]`);
    
    // Check if ChatGPT can use RPA: worker must be available AND report chatgpt as ready
    const rpaAvailableForChatGPT = !forceApiMode && rpaStatus.available && rpaStatus.engines.includes('chatgpt');
    console.log(`[Analysis API] ChatGPT RPA available: ${rpaAvailableForChatGPT} (forceApiMode=${forceApiMode})`);
    
    // Split engines into RPA (ChatGPT if available) and API (others + ChatGPT fallback)
    const rpaEngines: SupportedEngine[] = [];
    const apiEngines: SupportedEngine[] = [];
    
    for (const engine of engines) {
      if (engine === 'chatgpt') {
        if (forceApiMode) {
          // User explicitly requested API mode
          apiEngines.push(engine);
          console.log(`[Analysis API] ChatGPT -> API mode (user requested simulation_mode: api)`);
        } else if (rpaAvailableForChatGPT) {
          // RPA worker is online and ready for ChatGPT - use RPA for best quality
          rpaEngines.push(engine);
          console.log(`[Analysis API] ChatGPT -> RPA mode (worker ready)`);
        } else {
          // RPA worker offline or not ready - fallback to API mode
          apiEngines.push(engine);
          console.log(`[Analysis API] ChatGPT -> API mode (fallback: RPA ${rpaStatus.available ? 'not ready for chatgpt' : 'offline'})`);
        }
      } else {
        // All other engines use API mode
        apiEngines.push(engine);
      }
    }
    
    // Summary of engine routing
    console.log(`[Analysis API] Engine routing summary:`);
    console.log(`  - Requested: ${engines.length} engines [${engines.join(", ")}]`);
    console.log(`  - RPA engines: ${rpaEngines.length} [${rpaEngines.join(", ") || "none"}]`);
    console.log(`  - API engines: ${apiEngines.length} [${apiEngines.join(", ") || "none"}]`);
    
    // Sanity check: all engines should be accounted for
    if (rpaEngines.length + apiEngines.length !== engines.length) {
      console.error(`[Analysis API] ⚠️ ENGINE ROUTING BUG: ${rpaEngines.length} + ${apiEngines.length} != ${engines.length}`);
    }

    // Use prompt_set_id if provided, fall back to keyword_set_id for backwards compatibility
    const setId = prompt_set_id || keyword_set_id;

    // Validate required fields
    if (!brand_id || (!setId && (!prompt_ids || prompt_ids.length === 0)) || !engines || !language) {
      return NextResponse.json(
        { error: "Missing required fields. Provide brand_id, engines, language, and either prompt_set_id or prompt_ids" },
        { status: 400 }
      );
    }

    if (!Array.isArray(engines) || engines.length === 0) {
      return NextResponse.json(
        { error: "At least one engine must be selected" },
        { status: 400 }
      );
    }

    // Verify user has access to this brand
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", authedUser.id)
      .single();

    const { data: brand } = await supabase
      .from("brands")
      .select("*, organizations(*)")
      .eq("id", brand_id)
      .single();

    if (!brand || brand.organization_id !== profile?.organization_id) {
      return NextResponse.json(
        { error: "Brand not found or access denied" },
        { status: 404 }
      );
    }

    // Check credits
    const organization = brand.organizations;
    if (organization.credits_balance <= 0) {
      return NextResponse.json(
        { error: "Insufficient credits. Please upgrade your plan." },
        { status: 402 }
      );
    }

    // Get prompt count to estimate credits needed
    let promptCount = 0;
    
    if (prompt_ids && prompt_ids.length > 0) {
      promptCount = prompt_ids.length;
    } else if (setId) {
      const { count } = await supabase
        .from("prompts")
        .select("*", { count: "exact", head: true })
        .eq("prompt_set_id", setId);
      promptCount = count || 0;
    }

    const totalSimulations = promptCount * engines.length;

    if (organization.credits_balance < totalSimulations) {
      return NextResponse.json(
        {
          error: `Insufficient credits. Need ${totalSimulations} but have ${organization.credits_balance}`,
        },
        { status: 402 }
      );
    }

    // Create the batch record first
    // When running individual prompt analysis (single prompt_id), set prompt_id on the batch
    const singlePromptId = (prompt_ids && prompt_ids.length === 1) ? prompt_ids[0] : null;
    
    // Determine batch status based on what's being processed
    const hasRpaWork = rpaEngines.length > 0;
    const hasApiWork = apiEngines.length > 0;
    const batchStatus = hasRpaWork && !hasApiWork ? "awaiting_rpa" : "processing";
    
    const { data: batch, error: batchError } = await supabase
      .from("analysis_batches")
      .insert({
        brand_id,
        prompt_set_id: setId || null,
        prompt_id: singlePromptId,
        status: batchStatus,
        engines,
        language,
        region,
        total_simulations: totalSimulations,
        completed_simulations: 0,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (batchError) {
      return NextResponse.json(
        { error: batchError.message },
        { status: 500 }
      );
    }

    // Get all prompts
    let promptsToProcess: { id: string; text: string }[] = [];
    
    if (prompt_ids && prompt_ids.length > 0) {
      const { data: prompts } = await supabase
        .from("prompts")
        .select("id, text")
        .in("id", prompt_ids);
      promptsToProcess = prompts || [];
    } else if (setId) {
      const { data: prompts } = await supabase
        .from("prompts")
        .select("id, text")
          .eq("prompt_set_id", setId);
      promptsToProcess = prompts || [];
    }

    // STEP 1: Trigger crawl FIRST if not recently crawled
    // This ensures we have fresh crawl data for recommendations
    const crawlFreshnessHours = 24;
    const groundTruthSummary = brand.ground_truth_summary as { 
      crawl_analysis?: { last_crawled_at?: string } 
    } | null;
    const lastCrawledAt = groundTruthSummary?.crawl_analysis?.last_crawled_at;
    const needsCrawl = !lastCrawledAt || 
      (Date.now() - new Date(lastCrawledAt).getTime()) > crawlFreshnessHours * 60 * 60 * 1000;
    
    if (needsCrawl && brand.domain) {
      console.log(`[Analysis API] Triggering crawl for ${brand.domain} (last crawl: ${lastCrawledAt || 'never'})`);
      
      try {
        // Check if there's already a crawl in progress
        const { data: existingCrawl } = await supabase
          .from("crawl_jobs")
          .select("id, status")
          .eq("brand_id", brand_id)
          .in("status", ["pending", "crawling"])
          .single();
        
        if (!existingCrawl) {
          // Create crawl job
          let startUrl = brand.domain;
          if (!startUrl.startsWith("http://") && !startUrl.startsWith("https://")) {
            startUrl = `https://${startUrl}`;
          }
          
          const { data: crawlJob } = await supabase
            .from("crawl_jobs")
            .insert({
              brand_id,
              status: "pending",
              start_url: startUrl,
              max_pages: 10,
              max_depth: 2,
              include_paths: [],
              exclude_paths: [],
            })
            .select()
            .single();
          
          if (crawlJob) {
            // Trigger crawl job (fire and forget - don't wait)
            tasks.trigger("crawl-brand-website", {
              brand_id,
              crawl_job_id: crawlJob.id,
              start_url: startUrl,
              max_pages: 10,
              max_depth: 2,
              include_paths: [],
              exclude_paths: [],
            }).catch(err => console.error("[Analysis API] Crawl trigger failed:", err));
            
            console.log(`[Analysis API] Crawl job ${crawlJob.id} triggered`);
          }
        } else {
          console.log(`[Analysis API] Crawl already in progress: ${existingCrawl.id}`);
        }
      } catch (crawlError) {
        console.error("[Analysis API] Failed to trigger crawl:", crawlError);
        // Don't fail the analysis - continue without crawl
      }
    } else {
      console.log(`[Analysis API] Crawl data is fresh (last: ${lastCrawledAt})`);
    }

    // STEP 2: Create RPA simulations (ChatGPT only)
    if (hasRpaWork) {
      const rpaSimulations = [];
      for (const prompt of promptsToProcess) {
        for (const engine of rpaEngines) {
          rpaSimulations.push({
            brand_id,
            prompt_id: prompt.id,
            prompt_text: prompt.text,
            analysis_batch_id: batch.id,
            engine,
            language,
            region,
            status: "awaiting_rpa",
            selection_signals: {
              hallucination_watchdog: {
                enabled: enable_hallucination_watchdog || false,
                result: null,
              },
            },
          });
        }
      }
      
      if (rpaSimulations.length > 0) {
        const { error: simError } = await supabase
          .from("simulations")
          .insert(rpaSimulations);
        
        if (simError) {
          console.error("[Analysis] Failed to create ChatGPT simulations:", simError);
        } else {
          console.log(`[Analysis] Created ${rpaSimulations.length} ChatGPT simulations`);
        }
      }
    }

    // STEP 3: Trigger API jobs for all engines in apiEngines
    // This includes: all non-ChatGPT engines, plus ChatGPT if RPA is offline/not ready
    if (hasApiWork) {
      console.log(`[Analysis API] Triggering API job with ${apiEngines.length} engines: [${apiEngines.join(", ")}]`);
      
      const payload: RunAnalysisInput = {
        brand_id,
        prompt_set_id: setId,
        prompt_ids: prompt_ids,
        engines: apiEngines, // Includes ChatGPT if RPA is offline
        language,
        region,
        enable_hallucination_watchdog: enable_hallucination_watchdog || false,
        simulation_mode: 'api', // Always API for these
      };

      try {
        const handle = await tasks.trigger("run-keyword-set-analysis", payload);
        console.log(`[Analysis API] Trigger job started:`, handle.id);
      } catch (triggerError) {
        console.error("[Analysis API] Failed to trigger API job:", triggerError);
        // Don't fail the whole request, RPA might still work
      }
    } else {
      console.log(`[Analysis API] No API engines to trigger (all going to RPA)`);
    }

    // Create scheduled analysis if a schedule is specified
    let scheduledAnalysisId: string | null = null;
    if (schedule) {
      // Calculate next run time based on frequency
      const now = new Date();
      const nextRunAt = new Date(now);
      
      switch (schedule) {
        case 'daily':
          nextRunAt.setDate(nextRunAt.getDate() + 1);
          break;
        case 'weekly':
          nextRunAt.setDate(nextRunAt.getDate() + 7);
          break;
        case 'biweekly':
          nextRunAt.setDate(nextRunAt.getDate() + 14);
          break;
        case 'monthly':
          nextRunAt.setMonth(nextRunAt.getMonth() + 1);
          break;
      }

      const { data: scheduledAnalysis, error: scheduleError } = await supabase
        .from("scheduled_analyses")
        .insert({
          brand_id,
          prompt_id: singlePromptId,
          prompt_set_id: setId || null,
          engines,
          language,
          region,
          enable_hallucination_watchdog: enable_hallucination_watchdog || false,
          frequency: schedule,
          is_active: true,
          last_run_at: now.toISOString(),
          next_run_at: nextRunAt.toISOString(),
          run_count: 1,
          created_by: authedUser.id,
        })
        .select()
        .single();
      
      if (scheduleError) {
        console.error("Failed to create scheduled analysis:", scheduleError);
        // Don't fail the request, the immediate analysis will still run
      } else {
        scheduledAnalysisId = scheduledAnalysis?.id || null;
        console.log(`[Schedule] Created recurring ${schedule} analysis:`, scheduledAnalysisId);
        
        // Update the batch to link to this schedule
        if (scheduledAnalysisId) {
          await supabase
            .from("analysis_batches")
            .update({ scheduled_analysis_id: scheduledAnalysisId })
            .eq("id", batch.id);
        }
      }
    }

    // Response
    const modes: string[] = [];
    if (hasRpaWork) modes.push(`RPA: ${rpaEngines.join(", ")}`);
    if (hasApiWork) modes.push(`API: ${apiEngines.join(", ")}`);

    return NextResponse.json({
      success: true,
      batch_id: batch.id,
      total_simulations: totalSimulations,
      rpa_simulations: hasRpaWork ? promptsToProcess.length * rpaEngines.length : 0,
      api_simulations: hasApiWork ? promptsToProcess.length * apiEngines.length : 0,
      scheduled_analysis_id: scheduledAnalysisId,
      schedule: schedule || null,
      message: `Analysis started. Modes: ${modes.join("; ")}${schedule ? `. Scheduled to repeat ${schedule}.` : ''}`,
    });
  } catch (error) {
    console.error("Analysis run error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

