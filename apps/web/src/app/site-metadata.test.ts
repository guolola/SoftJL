// Guards crawler exclusions after retiring the public marketing homepage.
import { describe, expect, it, vi } from 'vitest';
import sitemap from './sitemap';

vi.mock('./styles/index.css', () => ({}));
import robots from './robots';
import { metadata } from './layout';

describe('community metadata', () => {
  it('blocks crawling without advertising a public sitemap', () => {
    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
    expect(sitemap()).toEqual([]);
  });

  it('excludes all application pages from indexing by default', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.openGraph).toBeUndefined();
    expect(metadata.alternates).toBeUndefined();
  });
});
