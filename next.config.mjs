/** @type {import('next').NextConfig} */
const nextConfig = {
  // =============================================
  // IMAGE OPTIMIZATION
  // =============================================
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.google.com',
        pathname: '/s2/favicons/**',
      },
    ],
    // Cache optimized images for longer
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days
    // Use modern formats
    formats: ['image/avif', 'image/webp'],
  },

  // =============================================
  // PERFORMANCE OPTIMIZATIONS
  // =============================================
  
  // Enable experimental features for better performance
  experimental: {
    // Optimize package imports to reduce bundle size
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'date-fns',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-select',
    ],
  },

  // =============================================
  // CACHING & HEADERS
  // =============================================
  async headers() {
    return [
      {
        // Cache static assets aggressively
        source: '/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif|woff|woff2)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Cache JS/CSS with revalidation
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // API routes should have shorter cache times
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, must-revalidate',
          },
        ],
      },
    ];
  },

  // =============================================
  // COMPILER OPTIMIZATIONS
  // =============================================
  compiler: {
    // Remove console.log in production
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // =============================================
  // BUNDLE OPTIMIZATION
  // =============================================
  
  // Enable SWC minification (faster than Terser)
  swcMinify: true,
  
  // Reduce build output
  productionBrowserSourceMaps: false,

  // =============================================
  // REWRITES FOR CLEANER URLS (optional)
  // =============================================
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
