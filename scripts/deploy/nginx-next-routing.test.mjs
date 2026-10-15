// Verifies the production Vite-to-Next routing switch and safe restoration.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { applyNextRouting, checkNextRouting, migrateNextRouting, restoreNextRouting } from './nginx-next-routing.mjs';

const deployPath = '/www/wwwroot/uml-platform';
const viteConfig = readFileSync(new URL('./nginx-jianglisoftware.com.conf', import.meta.url), 'utf8');

test('moves the known site to Next while retaining API, OnlyOffice, and TLS routes', () => {
  const nextConfig = migrateNextRouting(viteConfig, deployPath);
  assert.match(nextConfig, /proxy_pass http:\/\/127\.0\.0\.1:4003;/);
  assert.match(nextConfig, /location \/api\/ \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:4001;/);
  assert.match(nextConfig, /location \/onlyoffice\/ \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:8080\/;/);
  assert.match(nextConfig, /ssl_certificate /);
  assert.doesNotMatch(nextConfig, /try_files \/app\.html/);
  assert.equal(migrateNextRouting(nextConfig, deployPath), nextConfig);
  assert.throws(() => migrateNextRouting('server {}', deployPath), /Unknown site root/);
});

test('adds the Next proxy when optional legacy static locations are absent', () => {
  const reducedConfig = viteConfig
    .replace(/\n[ \t]*location = \/index\.html \{[\s\S]*?\n[ \t]*\}/, '')
    .replace(/\n[ \t]*location \/ \{[\s\S]*?\n[ \t]*\}/, '');

  const nextConfig = migrateNextRouting(reducedConfig, deployPath);

  assert.match(nextConfig, /location \/ \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:4003;/);
  assert.match(nextConfig, /location \/api\/ \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:4001;/);
  assert.equal((nextConfig.match(/proxy_pass http:\/\/127\.0\.0\.1:4003;/g) ?? []).length, 1);
});

test('changes only the UML server when another server has a root location', () => {
  const unrelatedServer = `server {
    listen 8088;
    server_name unrelated.example;
    location / {
        proxy_pass http://127.0.0.1:4999;
    }
}\n\n`;
  const combinedConfig = `${unrelatedServer}${viteConfig}`;

  const nextConfig = migrateNextRouting(combinedConfig, deployPath);

  assert.match(nextConfig, /server_name unrelated\.example;[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:4999;/);
  assert.match(nextConfig, /server_name jianglisoftware\.com;[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:4003;/);
  assert.equal((nextConfig.match(/proxy_pass http:\/\/127\.0\.0\.1:4999;/g) ?? []).length, 1);
  assert.equal((nextConfig.match(/proxy_pass http:\/\/127\.0\.0\.1:4003;/g) ?? []).length, 1);
});

test('accepts a directly configured Next proxy without a legacy web root', () => {
  const directConfig = `server {
    listen 443 ssl;
    server_name jianglisoftware.com;
    location /api/ {
        proxy_pass http://127.0.0.1:4001;
    }
    location / {
        proxy_pass http://127.0.0.1:4003;
    }
}\n`;
  const directory = mkdtempSync(path.join(os.tmpdir(), 'uml-next-routing-direct-'));
  try {
    const configPath = path.join(directory, 'site.conf');
    writeFileSync(configPath, directConfig);
    const runNginx = (...args) => args[0] === '-T'
      ? `# configuration file ${configPath}:\n${directConfig}`
      : '';

    const preflight = checkNextRouting(deployPath, runNginx);

    assert.equal(preflight.configPath, configPath);
    assert.equal(preflight.original, directConfig);
    assert.equal(preflight.migrated, directConfig);
    assert.equal(migrateNextRouting(preflight.migrated, deployPath), preflight.migrated);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('backs up exact config and restores it after a failed or rolled-back deployment', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'uml-next-routing-'));
  try {
    const configPath = path.join(directory, 'site.conf');
    const backupPath = path.join(directory, 'backup.json');
    writeFileSync(configPath, viteConfig);
    const calls = [];
    const runNginx = (...args) => {
      calls.push(args.join(' '));
      return args[0] === '-T' ? `# configuration file ${configPath}:\n${readFileSync(configPath, 'utf8')}` : '';
    };
    const preflight = checkNextRouting(deployPath, runNginx);
    assert.equal(preflight.original, viteConfig);
    assert.equal(readFileSync(configPath, 'utf8'), viteConfig);
    applyNextRouting(backupPath, deployPath, runNginx);
    assert.match(readFileSync(configPath, 'utf8'), /proxy_pass http:\/\/127\.0\.0\.1:4003;/);
    assert.ok(calls.includes('-t'));
    assert.ok(calls.includes('-s reload'));
    restoreNextRouting(backupPath, runNginx);
    assert.equal(readFileSync(configPath, 'utf8'), viteConfig);
    writeFileSync(configPath, 'concurrent edit');
    assert.throws(() => restoreNextRouting(backupPath, runNginx), /changed since deployment/);
    assert.equal(readFileSync(configPath, 'utf8'), 'concurrent edit');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('reverts the site config when Nginx rejects the Next route', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'uml-next-routing-invalid-'));
  try {
    const configPath = path.join(directory, 'site.conf');
    const backupPath = path.join(directory, 'backup.json');
    writeFileSync(configPath, viteConfig);
    let checks = 0;
    const runNginx = (...args) => {
      if (args[0] === '-T') return `# configuration file ${configPath}:\n${viteConfig}`;
      if (args[0] === '-t' && checks++ === 0) throw new Error('Invalid config');
      return '';
    };
    assert.throws(() => applyNextRouting(backupPath, deployPath, runNginx), /Invalid config/);
    assert.equal(readFileSync(configPath, 'utf8'), viteConfig);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
