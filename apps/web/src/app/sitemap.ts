// Publishes the one indexable marketing route.
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: 'https://jianglisoftware.com/', changeFrequency: 'weekly', priority: 1 }];
}
