/**
 * Advanced Fingerprint Generator
 * 
 * Generates realistic, consistent browser fingerprints that mimic real users.
 * Each fingerprint is a complete "identity" with matching characteristics.
 * 
 * Features:
 * - Consistent cross-property fingerprints (matching screen, GPU, fonts, etc.)
 * - Real device profiles from collected data
 * - Platform-specific characteristics
 * - Timezone/locale consistency with geo location
 */

// ===========================================
// Types
// ===========================================

export interface BrowserFingerprint {
  id: string;
  
  // User Agent
  userAgent: string;
  platform: 'Windows' | 'macOS' | 'Linux';
  
  // Screen
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
    pixelDepth: number;
    devicePixelRatio: number;
  };
  
  // Hardware
  hardware: {
    hardwareConcurrency: number;
    deviceMemory: number;
    maxTouchPoints: number;
  };
  
  // WebGL
  webGL: {
    vendor: string;
    renderer: string;
    version: string;
  };
  
  // Fonts
  fonts: string[];
  
  // Plugins
  plugins: Array<{
    name: string;
    filename: string;
    description: string;
  }>;
  
  // Locale & Timezone
  locale: {
    language: string;
    languages: string[];
    timezone: string;
    timezoneOffset: number;
  };
  
  // Media
  media: {
    audioCodecs: string[];
    videoCodecs: string[];
  };
  
  // Canvas
  canvas: {
    noise: number; // Small noise value to add to canvas
  };
  
  // Browser Features
  features: {
    webdriver: false;
    languages: string[];
    platform: string;
    doNotTrack: string | null;
    cookieEnabled: boolean;
    pdfViewerEnabled: boolean;
  };
}

// ===========================================
// Real Device Profiles
// ===========================================

const WINDOWS_PROFILES: Partial<BrowserFingerprint>[] = [
  {
    platform: 'Windows',
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24, devicePixelRatio: 1 },
    hardware: { hardwareConcurrency: 8, deviceMemory: 16, maxTouchPoints: 0 },
    webGL: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)', version: 'WebGL 2.0 (OpenGL ES 3.0 Chromium)' },
  },
  {
    platform: 'Windows',
    screen: { width: 2560, height: 1440, availWidth: 2560, availHeight: 1400, colorDepth: 24, pixelDepth: 24, devicePixelRatio: 1 },
    hardware: { hardwareConcurrency: 12, deviceMemory: 32, maxTouchPoints: 0 },
    webGL: { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', version: 'WebGL 2.0 (OpenGL ES 3.0 Chromium)' },
  },
  {
    platform: 'Windows',
    screen: { width: 1366, height: 768, availWidth: 1366, availHeight: 728, colorDepth: 24, pixelDepth: 24, devicePixelRatio: 1.25 },
    hardware: { hardwareConcurrency: 4, deviceMemory: 8, maxTouchPoints: 10 },
    webGL: { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', version: 'WebGL 2.0 (OpenGL ES 3.0 Chromium)' },
  },
];

const MACOS_PROFILES: Partial<BrowserFingerprint>[] = [
  {
    platform: 'macOS',
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1055, colorDepth: 30, pixelDepth: 30, devicePixelRatio: 2 },
    hardware: { hardwareConcurrency: 10, deviceMemory: 16, maxTouchPoints: 0 },
    webGL: { vendor: 'Apple Inc.', renderer: 'Apple M1 Pro', version: 'WebGL 2.0 (OpenGL ES 3.0 Chromium)' },
  },
  {
    platform: 'macOS',
    screen: { width: 2560, height: 1600, availWidth: 2560, availHeight: 1575, colorDepth: 30, pixelDepth: 30, devicePixelRatio: 2 },
    hardware: { hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0 },
    webGL: { vendor: 'Apple Inc.', renderer: 'Apple M2', version: 'WebGL 2.0 (OpenGL ES 3.0 Chromium)' },
  },
  {
    platform: 'macOS',
    screen: { width: 1440, height: 900, availWidth: 1440, availHeight: 875, colorDepth: 24, pixelDepth: 24, devicePixelRatio: 2 },
    hardware: { hardwareConcurrency: 8, deviceMemory: 16, maxTouchPoints: 0 },
    webGL: { vendor: 'Intel Inc.', renderer: 'Intel Iris Plus Graphics 640', version: 'WebGL 2.0 (OpenGL ES 3.0 Chromium)' },
  },
];

const LINUX_PROFILES: Partial<BrowserFingerprint>[] = [
  {
    platform: 'Linux',
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1053, colorDepth: 24, pixelDepth: 24, devicePixelRatio: 1 },
    hardware: { hardwareConcurrency: 16, deviceMemory: 32, maxTouchPoints: 0 },
    webGL: { vendor: 'Google Inc. (NVIDIA Corporation)', renderer: 'ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3090/PCIe/SSE2, OpenGL 4.6.0)', version: 'WebGL 2.0' },
  },
  {
    platform: 'Linux',
    screen: { width: 2560, height: 1440, availWidth: 2560, availHeight: 1413, colorDepth: 24, pixelDepth: 24, devicePixelRatio: 1 },
    hardware: { hardwareConcurrency: 8, deviceMemory: 16, maxTouchPoints: 0 },
    webGL: { vendor: 'AMD', renderer: 'AMD Radeon RX 580 Series (polaris10, LLVM 14.0.6, DRM 3.47, 5.19.0-46-generic)', version: 'WebGL 2.0' },
  },
];

// ===========================================
// User Agents by Platform and Version
// ===========================================

const USER_AGENTS: Record<string, string[]> = {
  'Windows': [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  ],
  'macOS': [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  ],
  'Linux': [
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  ],
};

// ===========================================
// Fonts by Platform
// ===========================================

const FONTS: Record<string, string[]> = {
  'Windows': [
    'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS', 'Consolas',
    'Courier New', 'Georgia', 'Impact', 'Lucida Console', 'Microsoft Sans Serif',
    'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
  ],
  'macOS': [
    'Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia', 'Helvetica',
    'Helvetica Neue', 'Impact', 'Lucida Grande', 'Monaco', 'Palatino', 'SF Pro',
    'Times', 'Times New Roman', 'Trebuchet MS', 'Verdana',
  ],
  'Linux': [
    'Arial', 'Cantarell', 'DejaVu Sans', 'DejaVu Serif', 'FreeMono', 'FreeSans',
    'Liberation Mono', 'Liberation Sans', 'Liberation Serif', 'Noto Sans',
    'Ubuntu', 'Ubuntu Mono',
  ],
};

// ===========================================
// Timezone/Locale Pairs
// ===========================================

const TIMEZONE_LOCALES: Array<{ timezone: string; language: string; languages: string[]; offset: number }> = [
  { timezone: 'America/New_York', language: 'en-US', languages: ['en-US', 'en'], offset: -300 },
  { timezone: 'America/Los_Angeles', language: 'en-US', languages: ['en-US', 'en'], offset: -480 },
  { timezone: 'America/Chicago', language: 'en-US', languages: ['en-US', 'en'], offset: -360 },
  { timezone: 'Europe/London', language: 'en-GB', languages: ['en-GB', 'en'], offset: 0 },
  { timezone: 'Europe/Paris', language: 'fr-FR', languages: ['fr-FR', 'en'], offset: 60 },
  { timezone: 'Europe/Berlin', language: 'de-DE', languages: ['de-DE', 'en'], offset: 60 },
  { timezone: 'Asia/Tokyo', language: 'ja-JP', languages: ['ja-JP', 'en'], offset: 540 },
  { timezone: 'Australia/Sydney', language: 'en-AU', languages: ['en-AU', 'en'], offset: 660 },
  { timezone: 'Asia/Dubai', language: 'ar-AE', languages: ['ar-AE', 'en'], offset: 240 },
];

// ===========================================
// Fingerprint Generator
// ===========================================

export class FingerprintGenerator {
  private usedFingerprints: Set<string> = new Set();
  
  /**
   * Generate a unique, realistic fingerprint
   */
  generate(preferredPlatform?: 'Windows' | 'macOS' | 'Linux'): BrowserFingerprint {
    // Select platform
    const platform = preferredPlatform || this.randomElement(['Windows', 'macOS', 'Linux'] as const);
    
    // Get platform-specific profile
    const profiles = platform === 'Windows' ? WINDOWS_PROFILES 
                   : platform === 'macOS' ? MACOS_PROFILES 
                   : LINUX_PROFILES;
    const profile = this.randomElement(profiles);
    
    // Select matching user agent
    const userAgent = this.randomElement(USER_AGENTS[platform]);
    
    // Select timezone/locale
    const locale = this.randomElement(TIMEZONE_LOCALES);
    
    // Generate unique ID
    const id = this.generateId();
    
    const fingerprint: BrowserFingerprint = {
      id,
      userAgent,
      platform,
      screen: profile.screen!,
      hardware: profile.hardware!,
      webGL: profile.webGL!,
      fonts: this.shuffleArray(FONTS[platform]).slice(0, 10 + Math.floor(Math.random() * 6)),
      plugins: this.getPlugins(platform, userAgent),
      locale: {
        language: locale.language,
        languages: locale.languages,
        timezone: locale.timezone,
        timezoneOffset: locale.offset,
      },
      media: {
        audioCodecs: ['audio/mpeg', 'audio/wav', 'audio/ogg; codecs="vorbis"', 'audio/webm; codecs="opus"'],
        videoCodecs: ['video/mp4; codecs="avc1.42E01E"', 'video/webm; codecs="vp8"', 'video/webm; codecs="vp9"'],
      },
      canvas: {
        noise: Math.random() * 0.0001, // Very small noise
      },
      features: {
        webdriver: false,
        languages: locale.languages,
        platform: this.getPlatformString(platform),
        doNotTrack: Math.random() > 0.7 ? '1' : null,
        cookieEnabled: true,
        pdfViewerEnabled: true,
      },
    };
    
    this.usedFingerprints.add(id);
    
    return fingerprint;
  }
  
  /**
   * Get plugins based on browser type
   */
  private getPlugins(platform: string, userAgent: string): BrowserFingerprint['plugins'] {
    const isChrome = userAgent.includes('Chrome');
    const isFirefox = userAgent.includes('Firefox');
    
    if (isChrome) {
      return [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ];
    }
    
    if (isFirefox) {
      return [
        { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      ];
    }
    
    return [];
  }
  
  /**
   * Get navigator.platform string
   */
  private getPlatformString(platform: string): string {
    switch (platform) {
      case 'Windows': return 'Win32';
      case 'macOS': return 'MacIntel';
      case 'Linux': return 'Linux x86_64';
      default: return 'Win32';
    }
  }
  
  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `fp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Utility: Random element from array
   */
  private randomElement<T>(array: readonly T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }
  
  /**
   * Utility: Shuffle array
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

// ===========================================
// Apply Fingerprint to Page
// ===========================================

export function getFingerprintScript(fingerprint: BrowserFingerprint): string {
  return `
    // Apply fingerprint: ${fingerprint.id}
    
    // Override navigator properties
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ${JSON.stringify(fingerprint.features.languages)} });
    Object.defineProperty(navigator, 'language', { get: () => '${fingerprint.locale.language}' });
    Object.defineProperty(navigator, 'platform', { get: () => '${fingerprint.features.platform}' });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${fingerprint.hardware.hardwareConcurrency} });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => ${fingerprint.hardware.deviceMemory} });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => ${fingerprint.hardware.maxTouchPoints} });
    Object.defineProperty(navigator, 'doNotTrack', { get: () => ${fingerprint.features.doNotTrack ? `'${fingerprint.features.doNotTrack}'` : 'null'} });
    Object.defineProperty(navigator, 'cookieEnabled', { get: () => ${fingerprint.features.cookieEnabled} });
    Object.defineProperty(navigator, 'pdfViewerEnabled', { get: () => ${fingerprint.features.pdfViewerEnabled} });
    
    // Override screen
    Object.defineProperty(screen, 'width', { get: () => ${fingerprint.screen.width} });
    Object.defineProperty(screen, 'height', { get: () => ${fingerprint.screen.height} });
    Object.defineProperty(screen, 'availWidth', { get: () => ${fingerprint.screen.availWidth} });
    Object.defineProperty(screen, 'availHeight', { get: () => ${fingerprint.screen.availHeight} });
    Object.defineProperty(screen, 'colorDepth', { get: () => ${fingerprint.screen.colorDepth} });
    Object.defineProperty(screen, 'pixelDepth', { get: () => ${fingerprint.screen.pixelDepth} });
    Object.defineProperty(window, 'devicePixelRatio', { get: () => ${fingerprint.screen.devicePixelRatio} });
    
    // Override timezone
    const originalDateTimeFormat = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function(...args) {
      const result = new originalDateTimeFormat(...args);
      const originalResolvedOptions = result.resolvedOptions.bind(result);
      result.resolvedOptions = function() {
        const options = originalResolvedOptions();
        options.timeZone = '${fingerprint.locale.timezone}';
        return options;
      };
      return result;
    };
    
    // Override plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = ${JSON.stringify(fingerprint.plugins)};
        plugins.length = ${fingerprint.plugins.length};
        plugins.item = (i) => plugins[i];
        plugins.namedItem = (n) => plugins.find(p => p.name === n);
        plugins.refresh = () => {};
        return plugins;
      }
    });
    
    // Override WebGL
    const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
      if (param === 37445) return '${fingerprint.webGL.vendor}';
      if (param === 37446) return '${fingerprint.webGL.renderer}';
      return originalGetParameter.call(this, param);
    };
    
    if (typeof WebGL2RenderingContext !== 'undefined') {
      const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(param) {
        if (param === 37445) return '${fingerprint.webGL.vendor}';
        if (param === 37446) return '${fingerprint.webGL.renderer}';
        return originalGetParameter2.call(this, param);
      };
    }
    
    // Add canvas noise
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type) {
      if (this.width > 16 && this.height > 16) {
        const ctx = this.getContext('2d');
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + (Math.random() > 0.5 ? 1 : -1)));
          }
          ctx.putImageData(imageData, 0, 0);
        }
      }
      return originalToDataURL.apply(this, arguments);
    };
    
    // Remove automation indicators
    delete window.__playwright;
    delete window.__puppeteer;
    delete window.__selenium;
    delete navigator.__proto__.webdriver;
    
    console.log('[Fingerprint] Applied: ${fingerprint.id}');
  `;
}

// ===========================================
// Singleton
// ===========================================

let generatorInstance: FingerprintGenerator | null = null;

export function getFingerprintGenerator(): FingerprintGenerator {
  if (!generatorInstance) {
    generatorInstance = new FingerprintGenerator();
  }
  return generatorInstance;
}

export default FingerprintGenerator;

