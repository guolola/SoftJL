// Verifies the community entry redirect, private metadata and real 404 boundary.
import { describe, expect, it, vi } from 'vitest';
import { notFound, redirect } from 'next/navigation';
import PlatformPage, { generateMetadata } from './page';

vi.mock('../App', () => ({ default: () => null }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('redirect'); }),
  notFound: vi.fn(() => { throw new Error('not-found'); }),
}));

describe('community server routes', () => {
  it.each([{ slug: undefined }, { slug: [] as string[] }])('redirects root params %j to projects', async ({ slug }) => {
    await expect(PlatformPage({ params: Promise.resolve({ slug }) })).rejects.toThrow('redirect');
    expect(redirect).toHaveBeenCalledWith('/projects');
  });

  it('excludes application pages from indexing without marketing metadata', () => {
    expect(generateMetadata()).toEqual({ title: 'SoftJL', robots: { index: false, follow: false } });
  });

  it('renders the project application', async () => {
    const page = await PlatformPage({ params: Promise.resolve({ slug: ['projects'] }) });
    expect(page.props.initialPath).toBe('/projects');
  });

  it('returns a real 404 for retired pages', async () => {
    await expect(PlatformPage({ params: Promise.resolve({ slug: ['features'] }) })).rejects.toThrow('not-found');
    expect(notFound).toHaveBeenCalled();
  });
});
