// Exposes crawler rules from the Next.js server.
import type { MetadataRoute } from 'next';
import { PUBLIC_SITE_URL } from '../features/marketing-site/model/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/projects/', '/account/', '/login'] },
    sitemap: `${PUBLIC_SITE_URL}/sitemap.xml`,
  };
}
