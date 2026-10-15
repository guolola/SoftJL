// Exposes crawler rules from the Next.js server.
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/projects/', '/account/', '/login'] },
    sitemap: 'https://jianglisoftware.com/sitemap.xml',
  };
}
