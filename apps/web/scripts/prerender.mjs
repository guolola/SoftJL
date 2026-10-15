// Produces crawlable marketing HTML and crawler-control artifacts after the Vite client build.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

process.env.NODE_ENV = "production";
const [{ default: React }, { renderToString }] = await Promise.all([
  import("react"),
  import("react-dom/server"),
]);

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(webRoot, "dist");
const defaultSiteUrl = "https://jianglisoftware.com";

function resolveSiteUrl() {
  const raw = process.env.PUBLIC_WEB_BASE_URL?.trim() || defaultSiteUrl;
  if (process.env.SEO_REQUIRE_SITE_URL === "true" && !process.env.PUBLIC_WEB_BASE_URL?.trim()) {
    throw new Error("PUBLIC_WEB_BASE_URL is required for a production SEO build.");
  }
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PUBLIC_WEB_BASE_URL must be an HTTPS origin without a path, query, or hash.");
  }
  return url.origin;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function replaceHead(html, tags) {
  return html.replace(/\s*<title>.*?<\/title>/su, "").replace("</head>", `${tags}\n  </head>`);
}

function routeHead(metadata, siteUrl, jsonLdId) {
  const canonical = new URL(metadata.canonicalPath, siteUrl).toString();
  const image = new URL(metadata.imagePath, siteUrl).toString();
  const social = [
    ["property", "og:type", "website"],
    ["property", "og:locale", "zh_CN"],
    ["property", "og:site_name", "SoftJL"],
    ["property", "og:title", metadata.title],
    ["property", "og:description", metadata.description],
    ["property", "og:url", canonical],
    ["property", "og:image", image],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", metadata.title],
    ["name", "twitter:description", metadata.description],
    ["name", "twitter:image", image],
  ]
    .map(([kind, key, content]) => `    <meta ${kind}="${escapeHtml(key)}" content="${escapeHtml(content)}" data-seo-social="true" />`)
    .join("\n");
  const structuredData = metadata.jsonLd?.length
    ? `\n    <script id="${jsonLdId}" type="application/ld+json">${JSON.stringify(metadata.jsonLd).replaceAll("<", "\\u003c")}</script>`
    : "";

  return `
    <title>${escapeHtml(metadata.title)}</title>
    <meta name="description" content="${escapeHtml(metadata.description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
${social}${structuredData}`;
}

function privateAppShell(template) {
  return replaceHead(
    template,
    `
    <title>SoftJL</title>
    <meta name="robots" content="noindex, nofollow" />`,
  );
}

function sitemapXml(siteUrl, paths) {
  const entries = paths
    .map((route) => `  <url><loc>${escapeHtml(new URL(route, siteUrl).toString())}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

const siteUrl = resolveSiteUrl();
const template = await readFile(path.join(distDir, "index.html"), "utf8");
await writeFile(path.join(distDir, "app.html"), privateAppShell(template), "utf8");

const vite = await createServer({
  root: webRoot,
  mode: "production",
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
try {
  const [{ default: App }, { MARKETING_SEO, SEO_JSON_LD_ID }] = await Promise.all([
    vite.ssrLoadModule("/src/app/App.tsx"),
    vite.ssrLoadModule("/src/features/marketing-site/model/seo.ts"),
  ]);
  const routes = Object.keys(MARKETING_SEO);
  const manifest = { version: 1, siteUrl, pages: [] };

  for (const route of routes) {
    const metadata = MARKETING_SEO[route];
    const body = renderToString(React.createElement(App, { initialPath: route }));
    const html = replaceHead(
      template.replace('<div id="root"></div>', `<div id="root" data-prerendered="true">${body}</div>`),
      routeHead(metadata, siteUrl, SEO_JSON_LD_ID),
    );
    const outputDir = route === "/" ? distDir : path.join(distDir, route.slice(1));
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, "index.html"), html, "utf8");
    manifest.pages.push({
      path: route,
      url: new URL(route, siteUrl).toString(),
      hash: createHash("sha256").update(body).update(JSON.stringify(metadata)).digest("hex"),
    });
  }

  await Promise.all([
    writeFile(
      path.join(distDir, "robots.txt"),
      `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /sandpack/\nDisallow: /vendor/\nSitemap: ${siteUrl}/sitemap.xml\n`,
      "utf8",
    ),
    writeFile(path.join(distDir, "sitemap.xml"), sitemapXml(siteUrl, routes), "utf8"),
    writeFile(path.join(distDir, "404.html"), privateAppShell(template).replace('<div id="root"></div>', `<div id="root" data-prerendered="true">${renderToString(React.createElement(App, { initialPath: "/404" }))}</div>`), "utf8"),
    writeFile(path.join(distDir, "seo-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
  ]);
} finally {
  await vite.close();
}
