const NEXT_PUBLIC_API_URL = process.env.API_URL ?? 'http://localhost:3001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@reconai/shared'],
  env: {
    NEXT_PUBLIC_API_URL,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${NEXT_PUBLIC_API_URL}/api/:path*`,
      },
    ];
  },
  experimental: {
    // Next 15 default for app router; keep Turbopack off for stable build
  },
};

export default nextConfig;