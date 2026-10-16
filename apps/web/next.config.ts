// Runs the AdminCN default layout in Next.js while keeping the API service separate.
import type { NextConfig } from 'next';
import { PRODUCT_TUTORIAL_URL } from './src/shared/lib/product-links';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Repository guidance is maintained in the root AGENTS.md, not generated during startup.
  agentRules: false,
  output: 'standalone',
  skipTrailingSlashRedirect: true,
  async redirects() {
    // Keep existing bookmarks and Markdown URLs working after removing the local guide.
    return [{ source: '/tutorial/:path*', destination: `${PRODUCT_TUTORIAL_URL}/:path*`, permanent: false }];
  },
  async rewrites() {
    const apiOrigin = process.env.UML_API_ORIGIN ?? 'http://127.0.0.1:4001';
    return [
      ...['oauth-protected-resource', 'oauth-authorization-server', 'openid-configuration'].map(name => ({ source: `/.well-known/${name}/:path*`, destination: `${apiOrigin}/.well-known/${name}/:path*` })),
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
    ];
  },
};

export default nextConfig;
