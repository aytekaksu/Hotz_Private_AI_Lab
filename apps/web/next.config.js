/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
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
