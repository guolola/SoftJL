// Maps existing platform URLs into the Next.js application during route migration.
import App from '../App';
import type { Metadata } from 'next';
import { MARKETING_SEO, PUBLIC_SITE_URL } from '../../features/marketing-site/model/seo';
import { DEFAULT_LOCALE, LOCALE_OG_LOCALE } from '../../shared/i18n/types';
import { matchAppRoute } from '../app-routes';
import { notFound } from 'next/navigation';

type PlatformPageProps = { params: Promise<{ slug?: string[] }> };

export async function generateMetadata({ params }: PlatformPageProps): Promise<Metadata> {
  const { slug = [] } = await params;
  if (slug.length === 0) {
    const home = MARKETING_SEO['/'];
    return {
      title: home.title,
      description: home.description,
      alternates: { canonical: PUBLIC_SITE_URL },
      robots: { index: true, follow: true },
      openGraph: {
        siteName: 'SoftJL',
        type: 'website',
        locale: LOCALE_OG_LOCALE[DEFAULT_LOCALE],
        title: home.title,
        description: home.description,
        url: PUBLIC_SITE_URL,
        images: [`${PUBLIC_SITE_URL}${home.imagePath}`],
      },
    };
  }
  return { title: 'SoftJL', robots: { index: false, follow: false } };
}

export default async function PlatformPage({
  params,
}: PlatformPageProps) {
  const { slug = [] } = await params;
  if (matchAppRoute(`/${slug.join('/')}`).kind === 'not-found') notFound();
  return <>
    {slug.length === 0 && <script
      id='marketing-seo-json-ld-server'
      type='application/ld+json'
      dangerouslySetInnerHTML={{ __html: JSON.stringify(MARKETING_SEO['/'].jsonLd).replace(/</g, '\\u003c') }}
    />}
    <App initialPath={`/${slug.join('/')}`} />
  </>;
}
