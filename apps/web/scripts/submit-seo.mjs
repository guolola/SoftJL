// Notifies supported search engines only when public SEO page hashes have changed.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readManifest(filePath, required) {
  if (!filePath) return null;
  try {
    return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
  } catch (error) {
    if (required) throw error;
    return null;
  }
}

const currentPath = argumentValue("--current") ?? path.join(webRoot, "dist", "seo-manifest.json");
const previousPath = argumentValue("--previous");
const current = await readManifest(currentPath, true);
const previous = await readManifest(previousPath, false);
const previousHashes = new Map((previous?.pages ?? []).map((page) => [page.path, page.hash]));
const changedUrls = current.pages
  .filter((page) => previousHashes.get(page.path) !== page.hash)
  .map((page) => page.url);

if (changedUrls.length === 0) {
  console.log("SEO submission skipped: no public page content changed.");
  process.exit(0);
}

const submissions = [];
const indexNowKey = process.env.INDEXNOW_KEY?.trim();
if (indexNowKey) {
  submissions.push(
    fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(current.siteUrl).host,
        key: indexNowKey,
        keyLocation: `${current.siteUrl}/indexnow-key.txt`,
        urlList: changedUrls,
      }),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`IndexNow returned HTTP ${response.status}`);
      console.log(`IndexNow accepted ${changedUrls.length} changed URL(s).`);
    }),
  );
} else {
  console.log("IndexNow skipped: INDEXNOW_KEY is not configured.");
}

const baiduToken = process.env.BAIDU_PUSH_TOKEN?.trim();
if (baiduToken) {
  const endpoint = new URL("https://data.zz.baidu.com/urls");
  endpoint.searchParams.set("site", current.siteUrl);
  endpoint.searchParams.set("token", baiduToken);
  submissions.push(
    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: `${changedUrls.join("\n")}\n`,
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Baidu submission returned HTTP ${response.status}`);
      const result = await response.json();
      if (result.error) throw new Error(`Baidu submission failed with code ${result.error}`);
      console.log(`Baidu accepted ${result.success ?? 0} changed URL(s).`);
    }),
  );
} else {
  console.log("Baidu submission skipped: BAIDU_PUSH_TOKEN is not configured.");
}

const results = await Promise.allSettled(submissions);
const failures = results.filter((result) => result.status === "rejected");
failures.forEach((result) => console.error(result.reason instanceof Error ? result.reason.message : String(result.reason)));
if (failures.length) process.exitCode = 1;
