// Migrates only this app's retired marketing routes, preserving site-specific TLS and proxy settings.
import { execFileSync } from "node:child_process";
import { accessSync, constants, readFileSync, realpathSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const redirect = /location\s+~\s+\^\/\(features\|workflow\|cases\|pricing\)\/\$\s*\{\s*return\s+301\s+\/\$1;\s*\}/g;
const pages = /location\s+~\s+\^\/\(features\|workflow\|cases\|pricing\)\$\s*\{\s*add_header\s+Cache-Control\s+"no-cache, no-store, must-revalidate"\s+always;\s*try_files\s+\$uri\/index\.html\s+\/index\.html\s+=404;\s*\}/g;
const retired = /location\s+~\s+\^\/\(features\|workflow\|cases\|pricing\)\/\?\$\s*\{\s*return\s+404;\s*\}/g;

export function migrateMarketingRoutes(config) {
  const redirects = [...config.matchAll(redirect)].length;
  const pageBlocks = [...config.matchAll(pages)].length;
  const retiredBlocks = [...config.matchAll(retired)].length;
  if (retiredBlocks === 1 && redirects === 0 && pageBlocks === 0) return config;
  if (redirects !== 1 || pageBlocks !== 1 || retiredBlocks !== 0) {
    throw new Error("Expected exactly the known legacy marketing route blocks; refusing to modify an unknown Nginx layout.");
  }
  return config.replace(redirect, "").replace(pages, "location ~ ^/(features|workflow|cases|pricing)/?$ {\n        return 404;\n    }");
}

export function findSiteConfigs(dump, webRoot) {
  return [...dump.matchAll(/^# configuration file (.+):\r?$/gm)]
    .map((match) => match[1])
    .filter((file) => {
      const config = readFileSync(file, "utf8");
      return [...config.matchAll(/^\s*root\s+([^;]+);/gm)]
        .some((match) => match[1].trim().replace(/^['"]|['"]$/g, "") === webRoot);
    })
    .map((file) => realpathSync(file))
    .filter((file, index, files) => files.indexOf(file) === index);
}

function nginx(...args) {
  return execFileSync(process.env.NGINX_BIN || "nginx", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

export function checkRouting(webRoot, runNginx = nginx) {
  if (!webRoot?.startsWith("/") || !webRoot.endsWith("/current/apps/web/dist")) {
    throw new Error("A release-specific absolute web root is required.");
  }
  const configs = findSiteConfigs(runNginx("-T"), webRoot);
  if (configs.length !== 1) throw new Error(`Expected one active app site configuration, found ${configs.length}.`);
  const configPath = configs[0];
  const original = readFileSync(configPath, "utf8");
  const migrated = migrateMarketingRoutes(original);
  if (original !== migrated) accessSync(configPath, constants.W_OK);
  return { configPath, original, migrated };
}

export function restoreRouting(backupPath, runNginx = nginx) {
  if (!existsSync(backupPath)) return;
  const { configPath, original, migrated } = JSON.parse(readFileSync(backupPath, "utf8"));
  const current = readFileSync(configPath, "utf8");
  if (current !== original && current !== migrated) {
    throw new Error("Nginx configuration changed after migration; refusing to overwrite concurrent changes.");
  }
  writeFileSync(configPath, original);
  runNginx("-t");
  runNginx("-s", "reload");
  console.log("Restored the previous marketing routing configuration.");
}

export function applyRouting(backupPath, webRoot, runNginx = nginx) {
  const { configPath, original, migrated } = checkRouting(webRoot, runNginx);
  if (original === migrated) {
    console.log("Retired marketing routes already return 404.");
    return;
  }
  // Persist recovery data before touching the active file; writeFile preserves its permissions.
  writeFileSync(backupPath, JSON.stringify({ configPath, original, migrated }), { flag: "wx", mode: 0o600 });
  try {
    writeFileSync(configPath, migrated);
    runNginx("-t");
    runNginx("-s", "reload");
  } catch (error) {
    restoreRouting(backupPath, runNginx);
    throw error;
  }
  console.log("Retired marketing routes migrated and Nginx reloaded.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  // Pass the resolved executable explicitly across sudo's sanitized environment.
  if (args.at(-2) === "--nginx-bin") {
    process.env.NGINX_BIN = args.pop();
    args.pop();
  }
  const [command, backupPath, webRoot] = args;
  if (command === "check") {
    checkRouting(backupPath);
    console.log("Nginx routing preflight passed; no configuration or service was changed.");
    process.exit(0);
  }
  if (!backupPath) throw new Error("A routing backup path is required.");
  if (command === "apply") applyRouting(backupPath, webRoot);
  else if (command === "restore") restoreRouting(backupPath);
  else throw new Error("Expected check, apply or restore.");
}
