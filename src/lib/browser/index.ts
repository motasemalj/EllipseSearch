/**
 * Browser Automation Module Index
 * 
 * Central exports for front-end answer capture using headless browser automation.
 * 
 * This module enables real-world parity measurement by capturing exactly what
 * humans see when using AI chat interfaces (ChatGPT, Perplexity, Gemini, Grok).
 * 
 * Features:
 * - Full DOM capture including citations, search chips, product tiles
 * - Session management with authentication support
 * - Browser pool for efficient parallel execution
 * - Hybrid mode combining API and browser for best results
 * - Advanced stealth mode to avoid bot detection
 * - Human-like behavior simulation
 * - Encrypted session persistence
 * - Residential proxy rotation (Bright Data, Oxylabs, Smartproxy, etc.)
 * - Advanced fingerprint spoofing (WebGL, Canvas, Fonts, etc.)
 * - Isolated browser profiles with identity rotation
 * - Distributed rate limiting with per-IP tracking
 */

// Types
export * from './types';

// Configuration
export {
  BROWSER_MODE,
  BROWSER_HEADLESS,
  BROWSER_TIMEOUT,
  BROWSER_POOL_CONFIG,
  RATE_LIMITS,
  FEATURES,
  getAuthCredentials,
  hasCredentials,
  getProxyConfig,
  log,
} from './config';

// Browser Management
export {
  getBrowserPool,
  shutdownBrowserPool,
  SessionManager,
  rateLimiter,
  ENGINE_URLS,
  ENGINE_LOGIN_URLS,
} from './browser-manager';

// Stealth & Anti-Detection
export {
  stealth,
  getStealthLaunchOptions,
  generateStealthContext,
  applyStealthToContext,
  applyStealthToPage,
  humanType,
  humanMouseMove,
  humanClick,
  humanScroll,
  humanWait,
  DEFAULT_STEALTH_CONFIG,
  type StealthConfig,
} from './stealth';

// Session Persistence
export {
  SessionStorage,
  getSessionStorage,
  captureSession,
  createContextWithSession,
  type StoredSession,
  type SessionConfig,
  type StorageState,
} from './session-storage';

// Authentication Flows
export {
  getAuthFlow,
  authenticateEngine,
  isEngineAuthenticated,
  type AuthCredentials as BrowserAuthCredentials,
  type AuthResult,
  type AuthFlowOptions,
} from './auth-flows';

// DOM Parser
export {
  DOMParser,
  createDOMParser,
  waitForStreamingComplete,
  typeWithHumanDelay,
  scrollToElement,
} from './dom-parser';

// Engine Implementations
export {
  BaseBrowserEngine,
  ChatGPTBrowserEngine,
  PerplexityBrowserEngine,
  GeminiBrowserEngine,
  GrokBrowserEngine,
  chatGPTEngine,
  perplexityEngine,
  geminiEngine,
  grokEngine,
  getBrowserEngine,
  type EngineSimulationInput,
} from './engines';

// Main factory function
export { 
  runBrowserSimulation, 
  runAPIOnlySimulation,
  runBrowserOnlySimulation,
  isBrowserModeAvailable,
  getRecommendedMode,
  type BrowserSimulationMode,
  type HybridSimulationInput,
  type HybridSimulationResult,
} from './hybrid-factory';

// ===========================================
// Advanced Anti-Detection (NEW)
// ===========================================

// Proxy Manager - Residential proxy rotation
export {
  ProxyManager,
  getProxyManager,
  hasProxySupport,
  type ProxyConfig,
  type ProxyProvider,
  type ProxyCredentials,
  type ProxyRotationConfig,
} from './proxy-manager';

// Fingerprint Generator - Advanced device emulation
export {
  FingerprintGenerator,
  getFingerprintGenerator,
  getFingerprintScript,
  type BrowserFingerprint,
} from './fingerprint-generator';

// Human Behavior - Bezier mouse curves, realistic typing
export {
  HumanBehavior,
  getHumanBehavior,
  DEFAULT_HUMAN_CONFIG,
  type HumanBehaviorConfig,
} from './human-behavior';

// Profile Manager - Isolated browser identities
export {
  ProfileManager,
  getProfileManager,
  type BrowserProfile,
  type ProfileManagerConfig,
} from './profile-manager';

// Advanced Rate Limiter - Distributed per-IP tracking
export {
  RateLimiter as AdvancedRateLimiter,
  getRateLimiter,
  type RateLimitConfig,
} from './rate-limiter';

// Persistent Profile - Manual verification + session reuse
export {
  getProfileDir,
  hasVerifiedProfile,
  markProfileVerified,
  updateProfileLastUsed,
  launchWithPersistentProfile,
  runInteractiveVerification,
  type PersistentProfile,
} from './persistent-profile';

// Advanced Cloudflare Bypass
export {
  bypassCloudflare,
  hasCloudflareChallenge,
} from './advanced-cloudflare-bypass';
