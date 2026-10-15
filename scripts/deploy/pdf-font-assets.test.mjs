// Verifies that cached PDF fonts and their license are packaged without network access.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';


test('prepares packaged fonts and their license offline from the local cache', () => {
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
