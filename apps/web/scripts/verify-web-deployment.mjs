// Verifies the community entry, private application, crawler exclusions and real 404s after release.
if (!process.env.PUBLIC_WEB_BASE_URL?.trim()) throw new Error('Set PUBLIC_WEB_BASE_URL to the deployment to verify.');
const baseUrl = new URL(process.env.PUBLIC_WEB_BASE_URL.trim());

async function request(pathname, init) {
  const response = await fetch(new URL(pathname, baseUrl), init);
  return { response, body: await response.text() };
}

const entry = await request('/', { redirect: 'manual' });
if (![307, 308].includes(entry.response.status) || new URL(entry.response.headers.get('location'), baseUrl).pathname !== '/projects') {
  throw new Error('Community entry must redirect to /projects.');
}

for (const path of ['/login', '/projects']) {
  const { response, body } = await request(path);
  if (response.status !== 200 || !body.includes('noindex') || body.includes('application/ld+json')) {
    throw new Error(`Application verification failed for ${path}: HTTP ${response.status}.`);
  }
}

const robots = await request('/robots.txt');
if (robots.response.status !== 200 || !robots.response.headers.get('content-type')?.includes('text/plain') || !robots.body.includes('Disallow: /') || robots.body.includes('Sitemap:')) {
  throw new Error('robots.txt must exclude the community application.');
}

const sitemap = await request('/sitemap.xml');
if (sitemap.response.status !== 200 || sitemap.body.includes('<loc>')) {
  throw new Error('Community sitemap must not publish application URLs.');
}

for (const path of ['/__missing_page_check__', '/features', '/workflow', '/cases', '/pricing', '/features/']) {
  const { response } = await request(path, { redirect: 'manual' });
  if (response.status !== 404) throw new Error(`Retired route ${path} must return 404, received ${response.status}.`);
}

console.log(`Community deployment verification passed for ${baseUrl.origin}.`);
