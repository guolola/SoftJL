// Checks all crawler-facing outputs use the same deployment origin.
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('deployment metadata', () => {
  it('uses the configured site for canonical, social, structured data and crawler URLs', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://community.example.test');
    vi.resetModules();
    const { MARKETING_SEO, PUBLIC_SITE_URL } = await import('../features/marketing-site/model/seo');
    const { default: robots } = await import('./robots');
    const { default: sitemap } = await import('./sitemap');
    const { generateMetadata } = await import('./[[...slug]]/page');
    expect(PUBLIC_SITE_URL).toBe('https://community.example.test');
    expect(MARKETING_SEO['/'].jsonLd?.every(item => item.url === PUBLIC_SITE_URL)).toBe(true);
    expect(robots().sitemap).toBe(`${PUBLIC_SITE_URL}/sitemap.xml`);
    expect(sitemap()[0].url).toBe(`${PUBLIC_SITE_URL}/`);
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: [] }) });
    expect(metadata.alternates?.canonical).toBe(PUBLIC_SITE_URL);
    expect(metadata.openGraph).toMatchObject({ url: PUBLIC_SITE_URL });
  });
});
