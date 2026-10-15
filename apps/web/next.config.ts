// Runs the AdminCN default layout in Next.js while keeping the API service separate.
import type { NextConfig } from 'next';
import { PRODUCT_TUTORIAL_URL } from './src/shared/lib/product-links';
import { resolvePublicSiteUrl } from './src/shared/lib/site-config';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Repository guidance is maintained in the root AGENTS.md, not generated during startup.
  agentRules: false,
  output: 'standalone',
  // Share the same canonical origin with server metadata and client-side navigation.
  env: { NEXT_PUBLIC_SITE_URL: resolvePublicSiteUrl(process.env.PUBLIC_WEB_BASE_URL, process.env.SEO_REQUIRE_SITE_URL === 'true') },
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
