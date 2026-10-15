// Runs post-release HTTP assertions for canonical pages, crawler files, private routes, and real 404s.
const baseUrl = new URL(process.env.PUBLIC_WEB_BASE_URL?.trim() || "https://jianglisoftware.com");
const canonicalBaseUrl = new URL(process.env.PUBLIC_CANONICAL_URL?.trim() || "https://jianglisoftware.com");
const publicRoutes = ["/"];

async function request(pathname, init) {
  const response = await fetch(new URL(pathname, baseUrl), init);
  const body = await response.text();
  return { response, body };
}

for (const route of publicRoutes) {
  const { response, body } = await request(route);
  const canonical = new URL(route, canonicalBaseUrl).toString();
  const canonicalTag = body.match(/<link rel="canonical" href="([^"]+)"/);
  if (response.status !== 200 || !canonicalTag || new URL(canonicalTag[1]).toString() !== canonical || !body.includes('application/ld+json')) {
    throw new Error(`Public SEO verification failed for ${route}: HTTP ${response.status}`);
  }
}

const privateRoute = await request("/login");
if (
  privateRoute.response.status !== 200 ||
  !privateRoute.body.includes('noindex')
) {
  throw new Error("Private route verification failed for /login.");
}

const robots = await request("/robots.txt");
if (robots.response.status !== 200 || !robots.response.headers.get("content-type")?.includes("text/plain") || !robots.body.includes("Sitemap:")) {
  throw new Error("robots.txt verification failed.");
}

const sitemap = await request("/sitemap.xml");
if (sitemap.response.status !== 200 || !sitemap.response.headers.get("content-type")?.includes("xml") || !sitemap.body.includes("<urlset")) {
  throw new Error("sitemap.xml verification failed.");
}

const cover = await fetch(new URL('/og-cover.png', baseUrl));
if (cover.status !== 200 || !cover.headers.get('content-type')?.startsWith('image/') || (await cover.arrayBuffer()).byteLength === 0) {
  throw new Error(`Social sharing cover verification failed: HTTP ${cover.status}.`);
}

const missing = await request("/__seo_missing_page_check__");
if (missing.response.status !== 404) throw new Error(`Expected a real 404, received HTTP ${missing.response.status}.`);

for (const route of ['/features', '/workflow', '/cases', '/pricing', '/features/']) {
  const result = await request(route, { redirect: 'manual' });
  if (result.response.status !== 404) throw new Error(`Retired route ${route} must return 404.`);
}

console.log(`SEO deployment verification passed for ${baseUrl.origin}.`);
