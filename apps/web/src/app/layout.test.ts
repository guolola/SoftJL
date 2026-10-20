// Verifies that crawlers receive a usable square raster icon from the document metadata.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { metadata } from './layout';

vi.mock('./styles/index.css', () => ({}));

describe('document icons', () => {
  it('declares an existing PNG with matching dimensions for search crawlers', () => {
    const icons = metadata.icons as { icon: { url: string; type: string; sizes: string }[] };
    const raster = icons.icon.find((icon) => icon.type === 'image/png');
    expect(raster).toBeDefined();
    const bytes = readFileSync(path.resolve('public', `.${raster!.url}`));
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    expect(width).toBeGreaterThanOrEqual(48);
    expect(width).toBe(height);
    expect(raster!.sizes).toBe(`${width}x${height}`);
  });
});

it('reserves the document scrollbar gutter when hover content changes page height', () => {
  const stylesheet = readFileSync('src/app/styles/business.css', 'utf8');
  expect(stylesheet).toMatch(/html\s*\{\s*scrollbar-gutter:\s*stable\s*;\s*\}/);
});
