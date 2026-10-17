// Binds reusable production builds to a commit, lockfile, runtime, and exact payload contents.
import { createHash } from 'node:crypto';
import { cpSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, unlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runtimeFingerprint, runtimesCompatible } from './runtime-fingerprint.mjs';
export { runtimeFingerprint } from './runtime-fingerprint.mjs';

export const BUILD_PATHS = [
  'apps/api/dist', 'apps/render-service/dist',
  'apps/web/.next/standalone', 'apps/web/.next/static',
  'packages/contracts/dist', 'packages/prompts/dist',
];
const manifestPath = '.deploy/build-manifest.json';
const digest = (value) => createHash('sha256').update(value).digest('hex');

function payloadEntries(root) {
  const entries = {};
  function visit(relative) {
    const full = path.join(root, relative);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(full);
      const resolved = path.resolve(path.dirname(full), target);
      if (path.isAbsolute(target) || !resolved.startsWith(path.resolve(root) + path.sep)) {
        throw new Error(`Build symlink escapes the payload: ${relative}`);
      }
      entries[relative] = { link: target.replaceAll('\\', '/') };
    } else if (stat.isDirectory()) {
      for (const name of readdirSync(full).sort()) visit(`${relative}/${name}`);
    } else if (stat.isFile()) {
      entries[relative] = { sha256: digest(readFileSync(full)) };
    } else {
      throw new Error(`Unsupported build entry: ${relative}`);
    }
  }
  for (const relative of BUILD_PATHS) visit(relative);
  return entries;
}

function materializeBuildLinks(root) {
  const prefix = realpathSync(root) + path.sep;
  const withinSource = (full) => {
    const resolved = realpathSync(full);
    if (!resolved.startsWith(prefix)) throw new Error(`Build link leaves the source checkout: ${full}`);
    return resolved;
  };
  function visit(full) {
    if (lstatSync(full).isSymbolicLink()) {
      // Next/Turbopack may link externalized modules back to the CI checkout.
      // Copy them before hashing so the archive never depends on that machine's paths.
      const target = withinSource(full);
      const temporary = `${full}.artifact-copy`;
      cpSync(target, temporary, { recursive: true, dereference: true, errorOnExist: true, force: false,
        filter: (source) => { withinSource(source); return true; } });
      unlinkSync(full);
      renameSync(temporary, full);
    }
    if (lstatSync(full).isDirectory()) for (const name of readdirSync(full)) visit(path.join(full, name));
  }
  for (const relative of BUILD_PATHS) visit(path.join(root, relative));
}

export function writeBuildManifest(root, releaseSha, runtime = runtimeFingerprint()) {
  if (!/^[a-f0-9]{40}$/i.test(releaseSha)) throw new Error('A full release commit SHA is required');
  materializeBuildLinks(root);
  const manifest = {
    version: 1, releaseSha,
    lockSha256: digest(readFileSync(path.join(root, 'package-lock.json'))),
    runtime,
    entries: payloadEntries(root),
  };
  mkdirSync(path.join(root, '.deploy'), { recursive: true });
  writeFileSync(path.join(root, manifestPath), `${JSON.stringify(manifest)}\n`);
  return manifest;
}

export function checkBuildManifest(buildRoot, releaseSha, sourceRoot, runtime = runtimeFingerprint()) {
  const manifest = JSON.parse(readFileSync(path.join(buildRoot, manifestPath), 'utf8'));
  if (manifest.version !== 1 || manifest.releaseSha !== releaseSha) throw new Error('Build commit does not match this release');
  if (manifest.lockSha256 !== digest(readFileSync(path.join(sourceRoot, 'package-lock.json')))) {
    throw new Error('Build dependencies do not match the release lockfile');
  }
  // Verify contents before considering compatibility; corruption must never trigger a silent fallback.
  if (JSON.stringify(payloadEntries(buildRoot)) !== JSON.stringify(manifest.entries)) {
    throw new Error('Build payload contents differ from the manifest');
  }
  return runtimesCompatible(manifest.runtime, runtime);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, root, releaseSha, sourceRoot = root] = process.argv.slice(2);
  try {
    if (command === 'compatible') {
      const server = JSON.parse(readFileSync(root, 'utf8'));
      if (!runtimesCompatible(runtimeFingerprint(), server)) {
        console.error('Build runtime:', JSON.stringify(runtimeFingerprint()));
        console.error('Server runtime:', JSON.stringify(server));
        process.exitCode = 3;
      }
    } else if (command === 'paths') {
      console.log(BUILD_PATHS.join('\n'));
    } else if (command === 'write') {
      writeBuildManifest(root, releaseSha);
    } else if (command === 'check') {
      if (!checkBuildManifest(root, releaseSha, sourceRoot)) {
        console.error('CI runtime differs from the server; a local build is required.');
        process.exitCode = 3;
      }
    } else {
      throw new Error('Expected paths, write, check, or compatible');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
