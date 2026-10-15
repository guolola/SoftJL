// Resolves runtime paths and entrypoint identity for server startup/version output.
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function resolveEntrypointPath(path: string) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function resolveRuntimeCwd() {
  try {
    return realpathSync(process.cwd());
  } catch {
    return resolve(process.cwd());
  }
}

export function isMainModule(metaUrl: string, argvPath = process.argv[1]) {
  if (!argvPath) {
    return false;
  }

  return (
    resolveEntrypointPath(fileURLToPath(metaUrl)) ===
    resolveEntrypointPath(argvPath)
  );
}
