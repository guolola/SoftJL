// Verifies retired tutorial URLs reach the hosted guide without requesting the external site.
import { expect, test } from '@playwright/test';

for (const suffix of ['', '/', '?article=provider-configuration', '/quick-start.md?lang=en']) {
  test(`redirects the retired tutorial URL ${suffix || '(root)'} to the online guide`, async ({ request }) => {
    const response = await request.get(`/tutorial${suffix}`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe(`https://jianglisoftware.com/tutorial${suffix === '/' ? '' : suffix}`);
    expect(await response.text()).not.toContain('product-docs-page');
  });
}
