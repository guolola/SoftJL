// Verifies crawler-visible brand metadata before the client app updates the document head.
import { describe, expect, it, vi } from 'vitest';
import { MARKETING_SEO, PUBLIC_SITE_URL } from '../../features/marketing-site/model/seo';
import { generateMetadata } from './page';

vi.mock('../App', () => ({ default: () => null }));

describe('server route metadata', () => {
  it.each([{ slug: undefined }, { slug: [] as string[] }])(
    'declares the public homepage brand for root params %j',
    async ({ slug }) => {
      const metadata = await generateMetadata({ params: Promise.resolve({ slug }) });
      const home = MARKETING_SEO['/'];

      expect(metadata).toMatchObject({
        title: home.title,
        description: home.description,
        alternates: { canonical: PUBLIC_SITE_URL },
        robots: { index: true, follow: true },
        openGraph: {
          siteName: 'SoftJL',
          type: 'website',
          locale: 'zh_CN',
          title: home.title,
          description: home.description,
          url: PUBLIC_SITE_URL,
        },
      });
    },
  );

  it.each(['login', 'projects', 'tutorial'])('keeps /%s excluded from indexing', async (path) => {
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: [path] }) });

    expect(metadata.title).toBe('SoftJL');
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.openGraph).toBeUndefined();
    expect(metadata.alternates).toBeUndefined();
  });
});
