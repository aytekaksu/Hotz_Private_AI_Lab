/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Keep large server-only packages external so the bundler skips heavy dependency graphs.
    serverComponentsExternalPackages: [
      'googleapis',
      '@notionhq/client',
      'pdf-parse',
      'mammoth',
    ],
  },
  // Performance optimizations
  swcMinify: true,
  compress: true,
  poweredByHeader: false,
  webpack: (config, { dev }) => {
    config.externals = config.externals || [];
    config.externals.push({ 'bun:sqlite': 'commonjs bun:sqlite' });

    // Optimize for development
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    
    return config;
  },
};

module.exports = nextConfig;
