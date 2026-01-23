import { defineConfig } from "@trigger.dev/sdk/v3";
import { playwright } from "@trigger.dev/build/extensions/playwright";

export default defineConfig({
  project: "proj_ctvrujnikrmepnvxoobn",
  runtime: "node",
  logLevel: "info",
  maxDuration: 600, // 10 minutes for browser operations
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
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
