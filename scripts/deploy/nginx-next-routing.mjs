// Switches only the known UML site from Vite files to the Next.js web process.
import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const oldRoot = '/current/apps/web/dist';
const nextRoot = '/current/apps/web/.next/standalone/apps/web/public';
const nextLocation = `location / {
        proxy_pass http://127.0.0.1:4003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }`;

function findBlockClose(config, open) {
  let depth = 0;
  for (let index = open; index < config.length; index += 1) {
    if (config[index] === '{') depth += 1;
    if (config[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function indentBlock(block, indent) {
  return block.split('\n').map((line) => `${indent}${line}`).join('\n');
}

function findServerBlock(config, webRoot) {
  const rootIndex = config.indexOf(`root ${webRoot};`);
  if (rootIndex < 0 || config.indexOf(`root ${webRoot};`, rootIndex + 1) >= 0) {
    throw new Error('Expected exactly one UML site root.');
  }
  const serverMatches = [...config.slice(0, rootIndex).matchAll(/^[ \t]*server[ \t]*\{/gm)];
  const serverStart = serverMatches.at(-1)?.index;
  if (serverStart === undefined) throw new Error('Cannot find the UML site server block.');
  const open = config.indexOf('{', serverStart);
  const close = findBlockClose(config, open);
  if (close < 0 || close < rootIndex) throw new Error('Cannot safely parse the UML site server block.');
  return { serverStart, close };
}

function insertRootLocation(config, webRoot) {
  const { close } = findServerBlock(config, webRoot);
  return `${config.slice(0, close).trimEnd()}\n\n${indentBlock(nextLocation, '    ')}\n${config.slice(close)}`;
}

export function migrateNextRouting(config, deployPath) {
  const oldWebRoot = `${deployPath}${oldRoot}`;
  const newWebRoot = `${deployPath}${nextRoot}`;
  const activeWebRoot = config.includes(`root ${oldWebRoot};`)
    ? oldWebRoot
    : config.includes(`root ${newWebRoot};`)
      ? newWebRoot
      : null;
  if (!activeWebRoot) {
    const directNextServers = [...config.matchAll(/^[ \t]*server[ \t]*\{/gm)]
      .map((match) => {
        const open = config.indexOf('{', match.index);
        const close = findBlockClose(config, open);
        return close < 0 ? '' : config.slice(match.index, close + 1);
      })
      .filter((server) => server.includes('server_name jianglisoftware.com;'))
      .filter((server) => server.includes('proxy_pass http://127.0.0.1:4001;'))
      .filter((server) => server.includes('proxy_pass http://127.0.0.1:4003;'));
    if (directNextServers.length === 1) return config.replace(directNextServers[0], directNextServers[0]);
    throw new Error('Unknown site root or API proxy; refusing to change Nginx routing.');
  }
  const { serverStart, close: serverClose } = findServerBlock(config, activeWebRoot);
  const beforeServer = config.slice(0, serverStart);
  const afterServer = config.slice(serverClose + 1);
  let result = config.slice(serverStart, serverClose + 1);
  if (result.includes(newWebRoot) && result.includes('proxy_pass http://127.0.0.1:4003;')) return `${beforeServer}${result}${afterServer}`;
  if (!result.includes(`root ${oldWebRoot};`) || !result.includes('location /api/ {')) {
    throw new Error('Unknown site root or API proxy; refusing to change Nginx routing.');
  }
  const staticLocations = [
    'location = /index.html', 'location = /',
    'location ~ ^/(features|workflow|cases|pricing)/?$',
    'location ~ ^/(login|register|verify-email|forgot-password|reset-password|workspace|exam|tutorial|invitations/accept|billing/alipay/return|account|account/security|settings/models|account/billing)$',
    'location ~ ^/projects(?:/.*)?$', 'location = /app.html',
    'location = /404.html', 'location /assets/',
  ];
  for (const prefix of staticLocations) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = [...result.matchAll(new RegExp(`^[ \\t]*${escaped}[ \\t]*\\{`, 'gm'))];
    if (matches.length > 1) throw new Error(`Expected at most one known Nginx block: ${prefix}`);
    if (matches.length === 0) continue;
    const locationStart = matches[0].index;
    const open = result.indexOf('{', locationStart + matches[0][0].length - 1);
    const close = findBlockClose(result, open);
    if (open < 0 || close < 0) {
      throw new Error(`Cannot safely parse Nginx block: ${prefix}`);
    }
    result = result.slice(0, locationStart) + result.slice(close + 1);
  }
  const rootLocationMatches = [...result.matchAll(/^[ \t]*location[ \t]+\/[ \t]*\{/gm)];
  if (rootLocationMatches.length > 1) throw new Error('Expected at most one root Nginx location block.');
  if (rootLocationMatches.length === 1) {
    const locationStart = rootLocationMatches[0].index;
    const open = result.indexOf('{', locationStart);
    const close = findBlockClose(result, open);
    if (close < 0) throw new Error('Cannot safely parse the root Nginx location block.');
    const indent = rootLocationMatches[0][0].match(/^[ \t]*/)?.[0] ?? '';
    result = result.slice(0, locationStart) + indentBlock(nextLocation, indent) + result.slice(close + 1);
  }
  result = result
    .replace(`root ${oldWebRoot};`, `root ${newWebRoot};`)
    .replace(/\s*index index\.html;/, '')
    .replace(/\s*error_page 404 \/404\.html;/, '');
  const migratedServer = rootLocationMatches.length === 0 ? insertRootLocation(result, newWebRoot) : result;
  return `${beforeServer}${migratedServer}${afterServer}`;
}

function nginx(...args) {
  return execFileSync(process.env.NGINX_BIN || 'nginx', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

export function checkNextRouting(deployPath, runNginx = nginx) {
  if (!deployPath?.startsWith('/') || deployPath === '/') throw new Error('An absolute deployment path is required.');
  const dump = runNginx('-T');
  const configFiles = [...dump.matchAll(/^# configuration file (.+):\r?$/gm)]
    .map((match) => realpathSync(match[1]))
    .filter((file, index, files) => files.indexOf(file) === index)
    .filter((file) => {
      const contents = readFileSync(file, 'utf8');
      const hasKnownRoot = contents.includes(`root ${deployPath}${oldRoot};`)
        || contents.includes(`root ${deployPath}${nextRoot};`);
      const hasDirectNextRouting = contents.includes('server_name jianglisoftware.com;')
        && contents.includes('proxy_pass http://127.0.0.1:4001;')
        && contents.includes('proxy_pass http://127.0.0.1:4003;');
      return hasKnownRoot || hasDirectNextRouting;
    });
  if (configFiles.length !== 1) throw new Error(`Expected one UML site config, found ${configFiles.length}.`);
  const configPath = configFiles[0];
  const original = readFileSync(configPath, 'utf8');
  const migrated = migrateNextRouting(original, deployPath);
  if (original !== migrated) accessSync(configPath, constants.W_OK);
  return { configPath, original, migrated };
}

export function applyNextRouting(backupPath, deployPath, runNginx = nginx) {
  const { configPath, original, migrated } = checkNextRouting(deployPath, runNginx);
  if (original === migrated) return;
  writeFileSync(backupPath, JSON.stringify({ configPath, original, migrated }), { flag: 'wx', mode: 0o600 });
  try {
    writeFileSync(configPath, migrated);
    runNginx('-t');
    runNginx('-s', 'reload');
  } catch (error) {
    writeFileSync(configPath, original);
    runNginx('-t');
    runNginx('-s', 'reload');
    throw error;
  }
}

export function restoreNextRouting(backupPath, runNginx = nginx) {
  if (!existsSync(backupPath)) return;
  const { configPath, original, migrated } = JSON.parse(readFileSync(backupPath, 'utf8'));
  const current = readFileSync(configPath, 'utf8');
  if (current !== original && current !== migrated) throw new Error('Nginx changed since deployment; refusing to overwrite it.');
  writeFileSync(configPath, original);
  runNginx('-t');
  runNginx('-s', 'reload');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.at(-2) === '--nginx-bin') {
    process.env.NGINX_BIN = args.pop();
    args.pop();
  }
  const [command, argument, deployPath] = args;
  if (command === 'check') checkNextRouting(argument);
  else if (command === 'apply') applyNextRouting(argument, deployPath);
  else if (command === 'restore') restoreNextRouting(argument);
  else throw new Error('Expected check, apply, or restore.');
}
