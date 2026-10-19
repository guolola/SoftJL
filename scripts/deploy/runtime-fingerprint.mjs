// Shares the strict build runtime check with the remote probe, which can also run through stdin.
import { pathToFileURL } from 'node:url';

export function runtimeFingerprint() {
  const header = process.report.getReport().header;
  return {
    platform: process.platform,
    arch: process.arch,
    node: process.versions.node,
    modules: process.versions.modules,
    openssl: process.versions.openssl,
    glibc: header.glibcVersionRuntime ?? null,
  };
}

export function runtimesCompatible(build, server) {
  const keys = ['platform', 'arch', 'node', 'modules', 'openssl', 'glibc'];
  return server?.platform === 'linux' && Boolean(server.glibc) &&
    keys.every((key) => typeof server[key] === 'string' && server[key] === build?.[key]);
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : import.meta.url.endsWith('/[eval1]');
if (isEntrypoint) {
  console.log(JSON.stringify(runtimeFingerprint()));
}
