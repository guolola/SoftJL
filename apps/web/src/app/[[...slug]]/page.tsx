// Maps platform URLs to application pages and sends the community entry to projects.
import App from '../App';
import type { Metadata } from 'next';
import { matchAppRoute } from '../app-routes';
import { notFound, redirect } from 'next/navigation';

type PlatformPageProps = { params: Promise<{ slug?: string[] }> };

export function generateMetadata(): Metadata {
  return { title: 'SoftJL', robots: { index: false, follow: false } };
}

export default async function PlatformPage({ params }: PlatformPageProps) {
  const { slug = [] } = await params;
  // Resolve the entry on the server before mounting the authenticated application.
  if (slug.length === 0) redirect('/projects');
  const path = `/${slug.join('/')}`;
  if (matchAppRoute(path).kind === 'not-found') notFound();
  return <App initialPath={path} />;
}
