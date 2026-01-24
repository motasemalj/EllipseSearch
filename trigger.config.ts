import { defineConfig } from "@trigger.dev/sdk/v3";
import { playwright } from "@trigger.dev/build/extensions/playwright";

export default defineConfig({
  project: "proj_ctvrujnikrmepnvxoobn",
  runtime: "node",
  logLevel: "info",
  
  // ═══════════════════════════════════════════════════════════════
  // OPTIMIZED FOR PARALLEL EXECUTION
  // ═══════════════════════════════════════════════════════════════
  // - Reduced maxDuration since parallelism speeds things up
  // - Faster retry settings to recover quickly
  // - Batch processing enabled for high throughput
  // ═══════════════════════════════════════════════════════════════
  
  maxDuration: 300, // 5 minutes (reduced from 10 - parallelism makes it faster)
  
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 2, // Reduced from 3 - faster failure detection
      factor: 1.5, // Faster retry backoff
      minTimeoutInMs: 500, // Reduced from 1000
      maxTimeoutInMs: 5000, // Reduced from 10000
      randomize: true, // Add jitter to prevent thundering herd
    },
  },
  
  dirs: ["./src/trigger/jobs"],
  
  // Build configuration for Playwright browser automation
  build: {
    // Use the official Playwright extension for proper browser support in deployment
    extensions: [
      playwright({
        // Install Chromium browser
        browsers: ["chromium"],
        // Use headless mode
        headless: true,
      }),
    ],
    // Externalize Playwright and all its dependencies from the bundle
    // This is necessary for dev mode and prevents bundling issues
    external: [
      "playwright",
      "playwright-core", 
      "chromium-bidi",
      "chromium-bidi/lib/cjs/bidiMapper/BidiMapper",
      "chromium-bidi/lib/cjs/cdp/CdpConnection",
      "@playwright/test",
    ],
  },
});
