// Serves built assets and production-shaped HTML shells without Vite's per-module dev connections.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(fileURLToPath(new URL("../../../apps/web/dist/", import.meta.url)));
const retired = /^\/(features|workflow|cases|pricing)\/?$/;
const contentTypes = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff",
  ".txt": "text/plain", ".xml": "application/xml", ".mp4": "video/mp4",
};

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    let file = path.resolve(dist, `.${pathname}`);
    if (file !== dist && !file.startsWith(`${dist}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    if (pathname === "/") file = path.join(dist, "index.html");
    else if (retired.test(pathname)) {
      file = path.join(dist, "404.html");
      response.statusCode = 404;
    } else if (!path.extname(pathname) && !pathname.startsWith("/api/")) {
      // Authenticated routes and tutorials must not hydrate the marketing homepage.
      file = path.join(dist, "app.html");
      response.setHeader("X-Robots-Tag", "noindex, nofollow");
    }
    if (!(await stat(file)).isFile()) throw new Error("Not a file");
    response.setHeader("Content-Type", contentTypes[path.extname(file)] || "application/octet-stream");
    response.setHeader("Cache-Control", "no-store");
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
}).listen(4175, "127.0.0.1", () => console.log("Production web preview ready on port 4175."));
