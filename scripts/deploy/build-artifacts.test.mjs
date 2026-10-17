// Checks that only intact builds for the same release and runtime can skip a server rebuild.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync, symlinkSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BUILD_PATHS, checkBuildManifest, writeBuildManifest } from './build-artifacts.mjs';
import { runtimeFingerprint, runtimesCompatible } from './runtime-fingerprint.mjs';

const sha = 'a'.repeat(40);
const runtime = { platform: 'linux', arch: 'x64', node: '22.20.0', modules: '127', openssl: '3.0.17', glibc: '2.39' };
const bash = process.env.UML_TEST_BASH ?? (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
const shellPath = (value) => value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);

test('stdin runtime probe agrees with the build check before any archive is uploaded', () => {
  const result = spawnSync(process.execPath, ['--input-type=module'], {
    encoding: 'utf8', input: readFileSync(new URL('./runtime-fingerprint.mjs', import.meta.url), 'utf8'),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), runtimeFingerprint());
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e',
    `await import(${JSON.stringify(new URL('./runtime-fingerprint.mjs', import.meta.url).href)})`], { encoding: 'utf8' });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, '');
  assert.equal(runtimesCompatible(runtime, runtime), true);
  for (const key of Object.keys(runtime)) {
    assert.equal(runtimesCompatible(runtime, { ...runtime, [key]: null }), false, key);
    assert.equal(runtimesCompatible(runtime, { ...runtime, [key]: 'different' }), false, key);
  }
  assert.equal(runtimesCompatible(runtime, null), false);
});

test('accepts an exact runtime and uses fallback for a different runtime', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'uml-build-artifact-'));
  try {
    writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}');
    for (const dir of BUILD_PATHS) {
      mkdirSync(path.join(root, dir), { recursive: true });
      writeFileSync(path.join(root, dir, 'output.js'), 'release output');
    }
    writeBuildManifest(root, sha, runtime);
    assert.equal(checkBuildManifest(root, sha, root, runtime), true);
    for (const [key, value] of Object.entries({ platform: 'win32', arch: 'arm64', node: '22.21.0', modules: '128', openssl: '3.0.18', glibc: '2.38' })) {
      assert.equal(checkBuildManifest(root, sha, root, { ...runtime, [key]: value }), false, key);
    }
    assert.equal(checkBuildManifest(root, sha, root, { ...runtime, glibc: null }), false);
    assert.throws(() => checkBuildManifest(root, 'b'.repeat(40), root, runtime), /commit/);
    writeFileSync(path.join(root, 'package-lock.json'), '{}');
    assert.throws(() => checkBuildManifest(root, sha, root, runtime), /lockfile/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects changed, missing, and extra files even when runtime compatibility fails', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'uml-build-integrity-'));
  try {
    writeFileSync(path.join(root, 'package-lock.json'), '{}');
    for (const dir of BUILD_PATHS) {
      mkdirSync(path.join(root, dir), { recursive: true });
      writeFileSync(path.join(root, dir, 'output.js'), 'original');
    }
    writeBuildManifest(root, sha, runtime);
    const target = path.join(root, BUILD_PATHS[0], 'output.js');
    writeFileSync(target, 'changed');
    assert.throws(() => checkBuildManifest(root, sha, root, { ...runtime, arch: 'arm64' }), /contents/);
    unlinkSync(target);
    assert.throws(() => checkBuildManifest(root, sha, root, runtime), /contents/);
    writeFileSync(target, 'original');
    writeFileSync(path.join(root, BUILD_PATHS[0], 'unexpected.js'), 'extra');
    assert.throws(() => checkBuildManifest(root, sha, root, runtime), /contents/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('materializes dependencies linked to the CI checkout for a portable payload', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'uml-build-links-'));
  try {
    writeFileSync(path.join(root, 'package-lock.json'), '{}');
    for (const dir of BUILD_PATHS) mkdirSync(path.join(root, dir), { recursive: true });
    const dependency = path.join(root, 'node_modules', 'externalized-module');
    mkdirSync(dependency, { recursive: true });
    writeFileSync(path.join(dependency, 'index.js'), 'module contents');
    const linked = path.join(root, 'apps/web/.next/standalone', 'module');
    symlinkSync(dependency, linked, process.platform === 'win32' ? 'junction' : 'dir');
    writeBuildManifest(root, sha, runtime);
    assert.equal(lstatSync(linked).isSymbolicLink(), false);
    assert.equal(readFileSync(path.join(linked, 'index.js'), 'utf8'), 'module contents');
    assert.equal(checkBuildManifest(root, sha, root, runtime), true);
    assert.equal(readFileSync(path.join(dependency, 'index.js'), 'utf8'), 'module contents');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const verificationStatus of [0, 3, 1]) {
  test(`server restore copies only a verified compatible build (verification status ${verificationStatus})`, () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'uml-build-restore-'));
    try {
      const source = path.join(root, 'source');
      const build = path.join(root, 'build');
      const archive = path.join(root, 'build.tar.gz');
      const deploy = path.join(root, 'deploy');
      mkdirSync(path.join(deploy, 'incoming'), { recursive: true });
      for (const relative of BUILD_PATHS) {
        for (const [base, content] of [[source, 'old'], [build, 'verified']]) {
          mkdirSync(path.join(base, relative), { recursive: true });
          writeFileSync(path.join(base, relative, 'output.js'), content);
        }
      }
      const fonts = ['NotoSansCJKsc-Regular.otf', 'NotoSansCJKsc-Bold.otf', 'LICENSE.txt'];
      mkdirSync(path.join(build, 'apps/render-service/dist/assets/pdf-fonts'), { recursive: true });
      for (const name of fonts) writeFileSync(path.join(build, 'apps/render-service/dist/assets/pdf-fonts', name), `verified ${name}`);
      execFileSync(bash, ['-c', 'tar -czf "$1" -C "$2" .', '--', shellPath(archive), shellPath(build)]);
      const script = readFileSync(new URL('./baota-pm2-git-deploy.sh', import.meta.url), 'utf8');
      const restore = script.slice(script.indexOf('restore_ci_build() {'), script.indexOf('copy_release_payload() {'));
      const result = spawnSync(bash, ['-s'], { encoding: 'utf8',
        env: { ...process.env, SOURCE_DIR: shellPath(source), DEPLOY_PATH: shellPath(deploy),
          BUILD_ARTIFACT: shellPath(archive), RELEASE_SHA: sha },
        input: `set -Eeuo pipefail\nnode() { if [[ "$2" == check ]]; then return ${verificationStatus}; fi; printf '%s\\n' ${BUILD_PATHS.map(p => `'${p}'`).join(' ')}; }\n${restore}\nif restore_ci_build; then exit 0; else exit $?; fi\n`,
      });
      assert.ifError(result.error);
      assert.equal(result.status, verificationStatus, result.stderr);
      for (const relative of BUILD_PATHS) {
        assert.equal(readFileSync(path.join(source, relative, 'output.js'), 'utf8'), verificationStatus === 0 ? 'verified' : 'old');
      }
      if (verificationStatus !== 1) {
        for (const name of fonts) assert.equal(readFileSync(path.join(source, 'apps/render-service/.runtime/pdf-fonts', name), 'utf8'), `verified ${name}`);
      }
      assert.deepEqual(readdirSync(path.join(deploy, 'incoming')), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
