// Guards self-hosted canonical URLs and rejects accidental production localhost/invalid targets.
import { describe, expect, it } from 'vitest';
import { resolvePublicSiteUrl } from './site-config';

describe('public site URL', () => {
  it('uses localhost only for unconfigured development', () => {
    expect(resolvePublicSiteUrl()).toBe('http://localhost:3000');
    expect(() => resolvePublicSiteUrl(undefined, true)).toThrow('PUBLIC_WEB_BASE_URL is required');
  });
  it('normalizes the deployment domain', () => {
    expect(resolvePublicSiteUrl(' https://community.example.test/ ', true)).toBe('https://community.example.test');
  });
  it.each(['http://community.example.test', 'http://localhost:3000', 'https://user:secret@example.test', 'https://example.test/app', 'https://example.test/?a=1', 'https://example.test/#home'])('rejects invalid production URL %s', url => {
    expect(() => resolvePublicSiteUrl(url, true)).toThrow();
  });
});
