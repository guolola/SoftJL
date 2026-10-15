// Verifies that transferred PDF font assets make server preparation work without network access.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('reuses identical server fonts and rejects changed or missing cache assets', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'uml-pdf-font-reuse-'));
  const cache = path.join(directory, 'cache');
  const archive = path.join(directory, 'fonts.tar.gz');
  const restored = path.join(directory, 'restored');
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  // Git Bash paths avoid treating Windows drive letters as tar remote hosts.
  const shellPath = (value) => value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
  const script = shellPath(path.resolve('scripts/deploy/reuse-pdf-font-cache.sh'));
  const assets = {
    'NotoSansCJKsc-Regular.otf': Buffer.from('OTTO-cache-regular'),
    'NotoSansCJKsc-Bold.otf': Buffer.from('OTTO-cache-bold'),
    'LICENSE.txt': Buffer.from('cache font license'),
  };
  mkdirSync(cache);
  mkdirSync(restored);
  try {
    for (const [name, content] of Object.entries(assets)) writeFileSync(path.join(cache, name), content);
    const digest = createHash('sha256').update(Buffer.concat(Object.values(assets))).digest('hex');
    const args = [script, shellPath(cache), digest, shellPath(archive)];
    assert.match(execFileSync(bash, args, { encoding: 'utf8' }), /Reused verified PDF font cache/);
    execFileSync(bash, ['-c', 'tar -xzf "$1" -C "$2"', '--', shellPath(archive), shellPath(restored)]);
    for (const [name, content] of Object.entries(assets)) assert.deepEqual(readFileSync(path.join(restored, name)), content);

    const validArchive = readFileSync(archive);
    writeFileSync(path.join(cache, 'NotoSansCJKsc-Bold.otf'), 'different font');
    assert.equal(spawnSync(bash, args).status, 3);
    assert.deepEqual(readFileSync(archive), validArchive);
    rmSync(path.join(cache, 'LICENSE.txt'));
    rmSync(archive);
    assert.equal(spawnSync(bash, args).status, 3);
    assert.equal(existsSync(archive), false);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('prepares packaged fonts and their license offline after restoring the cache', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'uml-pdf-font-deploy-'));
  const scripts = path.join(directory, 'scripts');
  const cache = path.join(directory, '.runtime', 'pdf-fonts');
  mkdirSync(scripts, { recursive: true });
  mkdirSync(cache, { recursive: true });
  const assets = {
    'NotoSansCJKsc-Regular.otf': Buffer.from('OTTO-test-regular'),
    'NotoSansCJKsc-Bold.otf': Buffer.from('OTTO-test-bold'),
    'LICENSE.txt': Buffer.from('test font license'),
  };
  try {
    for (const [name, content] of Object.entries(assets)) writeFileSync(path.join(cache, name), content);
    copyFileSync(new URL('../../apps/render-service/scripts/prepare-pdf-fonts.mjs', import.meta.url), path.join(scripts, 'prepare-pdf-fonts.mjs'));
    const environment = { ...process.env };
    delete environment.UML_PDF_FONT_REGULAR;
    delete environment.UML_PDF_FONT_BOLD;
    // Fail any download so a passed test proves the restored cache is sufficient.
    const output = execFileSync(process.execPath, [
      '--import=data:text/javascript,globalThis.fetch=()=>{throw new Error("Unexpected network download")}',
      path.join(scripts, 'prepare-pdf-fonts.mjs'),
    ], { env: environment, encoding: 'utf8' });
    assert.match(output, /PDF fonts ready/);
    for (const [name, content] of Object.entries(assets)) {
      assert.deepEqual(readFileSync(path.join(directory, 'dist', 'assets', 'pdf-fonts', name)), content);
    }
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});
