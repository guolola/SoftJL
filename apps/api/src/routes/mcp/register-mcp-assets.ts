// Serves only the fixed generic verifier; project data and code execution never enter this download route.
import type { FastifyInstance } from "fastify";
import { verifierAsset } from "../../mcp/verification/verifier-distribution.js";

export function registerMcpAssets(app: FastifyInstance) {
  app.get(verifierAsset.path, async (request, reply) => {
    reply
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .header("ETag", verifierAsset.etag)
      .header("Content-Type", "text/javascript; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${verifierAsset.fileName}"`)
      .header("X-Content-Type-Options", "nosniff");
    const candidates = request.headers["if-none-match"]?.split(",").map((value) => value.trim().replace(/^W\//, ""));
    if (candidates?.some((value) => value === "*" || value === verifierAsset.etag)) return reply.code(304).send();
    // Reuse bytes computed once at module load; downloads never rebuild a workspace.
    return reply.send(verifierAsset.bytes);
  });
}
