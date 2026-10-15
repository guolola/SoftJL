// Describes one immutable, project-independent verifier file using its exact UTF-8 byte hash.
import { createHash } from "node:crypto";
import { implementationVerifierSource } from "./verifier-source.js";

const bytes = Buffer.from(implementationVerifierSource, "utf8");
const digest = createHash("sha256").update(bytes).digest("hex");
export const verifierAsset = {
  fileName: "uml-verify.mjs",
  bytes,
  contentHash: `sha256:${digest}`,
  path: `/api/mcp/assets/${digest}/uml-verify.mjs`,
  etag: `"${digest}"`,
};

export function verifierDownload(origin?: string) {
  return {
    fileName: verifierAsset.fileName,
    downloadUrl: origin ? new URL(verifierAsset.path, origin).href : verifierAsset.path,
    contentHash: verifierAsset.contentHash,
    byteLength: verifierAsset.bytes.length,
    encoding: "utf-8",
  };
}
