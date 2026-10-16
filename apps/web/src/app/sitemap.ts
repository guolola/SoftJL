// Retains the sitemap endpoint without publishing private community application URLs.
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [];
}
