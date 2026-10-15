// Registers render/provider endpoints and delegates external calls to adapters.
import { validateModelInput, ModelSemanticError } from "@uml-platform/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  designDiagramModelSpecSchema,
  diagramModelSpecSchema,
  type ProjectPermission,
  renderPngRequestSchema,
  renderPngResponseSchema,
  renderPdfRequestSchema,
  renderPdfResponseSchema,
  renderStructuredModelRequestSchema,
  renderStructuredModelResponseSchema,
  renderSvgRequestSchema,
  renderSvgResponseSchema,
} from "@uml-platform/contracts";
import type { RenderClient } from "../../adapters/render/render-client.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import type { PdfRenderClient } from "../../adapters/render/pdf-render-client.js";
import {
  generateDesignPlantUmlArtifacts,
  generatePlantUmlArtifacts,
} from "../../plantuml.js";

export function registerRenderRoutes({
  app,
  renderClient,
  pngRenderClient,
  pdfRenderClient,
  resolveUserId,
  projectMembershipGuard,
}: {
  app: FastifyInstance;
  renderClient: RenderClient;
  pngRenderClient: PngRenderClient;
  pdfRenderClient?: PdfRenderClient;
  resolveUserId: (request: FastifyRequest) => Promise<string | null>;
  projectMembershipGuard: (input: {
    projectId: string;
    userId: string;
    permission: ProjectPermission;
  }) => Promise<boolean>;
}) {
  async function requireRenderProjectAccess(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const userId = await resolveUserId(request);
    const projectIdHeader = request.headers["x-uml-project-id"];
    const projectId =
      typeof projectIdHeader === "string" ? projectIdHeader.trim() : "";

    if (!userId || !projectId) {
      reply.code(401);
      return { ok: false as const, message: "请先登录并进入项目" };
    }

    const allowed = await projectMembershipGuard({
      projectId,
      userId,
      permission: "view_project",
    });
    if (!allowed) {
      reply.code(403);
      return { ok: false as const, message: "Project permission required" };
    }

    return { ok: true as const };
  }

  function trackDownloadCancellation(request: FastifyRequest, reply: FastifyReply) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    // A completed request body can still lose its client while the renderer is working.
    const close = () => { if (!reply.raw.writableEnded) abort(); };
    request.raw.once("aborted", abort);
    reply.raw.once("close", close);
    if (request.raw.aborted) abort();
    return {
      signal: controller.signal,
      dispose: () => {
        request.raw.off("aborted", abort);
        reply.raw.off("close", close);
      },
    };
  }

  app.post("/api/render/svg", async (request, reply) => {
    const access = await requireRenderProjectAccess(request, reply);
    if (!access.ok) return { message: access.message };

    const input = renderSvgRequestSchema.parse(request.body);
    try {
      return renderSvgResponseSchema.parse(
        await renderClient({
          diagramKind: input.diagramKind,
          source: input.plantUmlSource,
        }),
      );
    } catch (error) {
      request.log.error(error);
      reply.code(400);
      return {
        message: error instanceof Error ? error.message : "Unknown render error",
        ...(error instanceof ModelSemanticError ? { diagnostics: error.diagnostics } : {}),
      };
    }
  });

  app.post("/api/render/model", async (request, reply) => {
    const access = await requireRenderProjectAccess(request, reply);
    if (!access.ok) return { message: access.message };

    const input = renderStructuredModelRequestSchema.parse(request.body);
    try {
      const diagnostics = validateModelInput(input.model, input.stage);
      if (diagnostics.length) throw new ModelSemanticError(diagnostics);
      const [artifact] = input.stage === "design"
        ? generateDesignPlantUmlArtifacts([designDiagramModelSpecSchema.parse(input.model)])
        : generatePlantUmlArtifacts([diagramModelSpecSchema.parse(input.model)]);
      if (!artifact) {
        reply.code(400);
        return { message: "模型无法生成 PlantUML" };
      }
      const rendered = await renderClient({
        diagramKind: artifact.diagramKind,
        source: artifact.source,
      });
      return renderStructuredModelResponseSchema.parse({
        plantUmlSource: artifact.source,
        ...rendered,
      });
    } catch (error) {
      request.log.error(error);
      reply.code(400);
      return {
        message: error instanceof Error ? error.message : "Unknown render error",
        ...(error instanceof ModelSemanticError ? { diagnostics: error.diagnostics } : {}),
      };
    }
  });

  app.post("/api/render/png", async (request, reply) => {
    const access = await requireRenderProjectAccess(request, reply);
    if (!access.ok) return { message: access.message };

    const cancellation = trackDownloadCancellation(request, reply);
    try {
      const input = renderPngRequestSchema.parse(request.body);
      const rendered = await pngRenderClient({
        diagramKind: input.diagramKind,
        source: input.plantUmlSource,
      }, cancellation.signal);
      return renderPngResponseSchema.parse({
        pngBase64: rendered.png.toString("base64"),
        renderMeta: rendered.renderMeta,
      });
    } catch (error) {
      request.log.error(error);
      reply.code(400);
      return {
        message: error instanceof Error ? error.message : "Unknown render error",
        ...(error instanceof ModelSemanticError ? { diagnostics: error.diagnostics } : {}),
      };
    } finally {
      cancellation.dispose();
    }
  });

  app.post("/api/render/pdf", async (request, reply) => {
    const access = await requireRenderProjectAccess(request, reply);
    if (!access.ok) return { message: access.message };
    const cancellation = trackDownloadCancellation(request, reply);
    try {
      const input = renderPdfRequestSchema.parse(request.body);
      if (!pdfRenderClient) {
        reply.code(503);
        return { message: "PDF renderer is unavailable" };
      }
      const rendered = await pdfRenderClient({ diagramKind: input.diagramKind, source: input.plantUmlSource }, cancellation.signal);
      return renderPdfResponseSchema.parse({ pdfBase64: rendered.pdf.toString("base64"), renderMeta: rendered.renderMeta });
    } catch (error) {
      request.log.error(error);
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Unknown PDF render error" };
    } finally {
      cancellation.dispose();
    }
  });

  app.post("/api/provider/test", async (request, reply) => {
    void request;
    reply.code(403);
    return {
      ok: false,
      message:
        "Plaintext apiBaseUrl/apiKey provider tests are disabled. Use a managed Provider configuration instead.",
    };
  });
}
