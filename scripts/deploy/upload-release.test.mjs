// Exercises interrupted transfer retries and failure propagation without opening a network connection.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const bash = process.env.UML_TEST_BASH ?? (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
const shellPath = (value) => value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);

for (const failAlways of [false, true]) {
  test(`upload ${failAlways ? 'fails closed after bounded retries' : 'retries using retained partial data'}`, () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'uml-upload-'));
    try {
      const source = path.join(root, 'release file');
      const stub = path.join(root, 'commands.sh');
      writeFileSync(source, 'release payload');
      writeFileSync(stub, `
timeout() { shift; "$@"; }
sleep() { :; }
rsync() {
  printf '%s\\n' "$@" > "$TEST_ROOT/arguments"
  printf 'attempt\\n' >> "$TEST_ROOT/attempts"
  if [[ ! -f "$TEST_ROOT/partial" ]]; then
    echo partial > "$TEST_ROOT/partial"
    return 23
  fi
  echo resumed
  return ${failAlways ? 23 : 0}
}
`);
      const result = spawnSync(bash, [shellPath(fileURLToPath(new URL('./upload-release.sh', import.meta.url))), shellPath(source), '/srv/incoming/release/', '/srv/current'], {
        encoding: 'utf8', env: { ...process.env, BASH_ENV: shellPath(stub), TEST_ROOT: shellPath(root), DEPLOY_HOST: 'example.test', DEPLOY_USER: 'deployer' },
      });
      assert.ifError(result.error);
      assert.equal(result.status, failAlways ? 23 : 0, result.stderr);
      assert.equal(readFileSync(path.join(root, 'attempts'), 'utf8').trim().split('\n').length, failAlways ? 3 : 2);
      assert.match(result.stdout, /resumed/);
      const args = readFileSync(path.join(root, 'arguments'), 'utf8').split('\n');
      assert.ok(args.includes('--partial-dir=.rsync-partial'));
      assert.ok(args.includes('--delay-updates'));
      assert.ok(args.includes('--link-dest=/srv/current'));
      assert.ok(args.includes(shellPath(source)));
      assert.ok(!args.includes('--inplace'));
      if (failAlways) assert.match(result.stderr, /activation was not started/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
