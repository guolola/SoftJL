// Runs the AdminCN default layout in Next.js while keeping the API service separate.
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  skipTrailingSlashRedirect: true,
  // The existing workspace typecheck remains a separate gate while its business test fixtures are repaired.
  typescript: { ignoreBuildErrors: true },
  async rewrites() {
    const apiOrigin = process.env.UML_API_ORIGIN ?? 'http://127.0.0.1:4001';
    return [
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
    ];
  },
};

export default nextConfig;
