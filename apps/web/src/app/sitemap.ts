// Publishes the one indexable marketing route.
import type { MetadataRoute } from 'next';
import { PUBLIC_SITE_URL } from '../features/marketing-site/model/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${PUBLIC_SITE_URL}/`, changeFrequency: 'weekly', priority: 1 }];
}
