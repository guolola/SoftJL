// Exposes PlantUML rendering helpers and the standalone render-service HTTP entrypoint.
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { realpathSync } from "node:fs";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderPngRequestSchema,
  renderPngResponseSchema,
  renderPdfRequestSchema,
  renderPdfResponseSchema,
  type RenderPdfRequest,
  type RenderPdfResponse,
  renderSvgRequestSchema,
  renderSvgResponseSchema,
  type RenderPngRequest,
  type RenderPngResponse,
  type RenderSvgRequest,
  type RenderSvgResponse,
} from "@uml-platform/contracts";
import { pdfFontsReady, svgToVectorPdf } from "./pdf/vector-pdf.js";

const DEFAULT_PORT = Number(process.env.RENDER_SERVICE_PORT ?? 4002);
const DEFAULT_HOST = process.env.RENDER_SERVICE_HOST ?? "127.0.0.1";
const DEFAULT_LOCAL_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://127.0.0.1:5176",
];
const DEFAULT_JAR_PATH = fileURLToPath(
  new URL("../../../plantuml/build/libs/plantuml-1.2026.3beta8.jar", import.meta.url),
);
const DEFAULT_JAVA_ARGS = ["-Xmx128m"];

type RenderServerOptions = {
  renderSvg?: (input: RenderSvgRequest) => Promise<RenderSvgResponse>;
  renderPng?: (input: RenderPngRequest) => Promise<RenderPngResponse>;
  renderPdf?: (input: RenderPdfRequest) => Promise<RenderPdfResponse>;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readJavaArgs() {
  const configured = process.env.UML_PLANTUML_JAVA_ARGS?.trim();
  if (!configured) return DEFAULT_JAVA_ARGS;
  return configured.split(/\s+/).filter(Boolean);
}

function createConcurrencyQueue(concurrency: number) {
  let running = 0;
  const queue: Array<() => void> = [];

  function drain() {
    while (running < concurrency && queue.length > 0) {
      running += 1;
      queue.shift()?.();
    }
  }

  return async function enqueue<T>(task: () => Promise<T>) {
    await new Promise<void>((resolve) => {
      queue.push(resolve);
      drain();
    });
    try {
      return await task();
    } finally {
      running -= 1;
      drain();
    }
  };
}

async function renderWithPlantUml(
  input: RenderSvgRequest,
  outputFormat: "svg" | "png",
  jarPath = DEFAULT_JAR_PATH,
  javaArgs = readJavaArgs(),
): Promise<{ output: Buffer; stderr: string; durationMs: number }> {
  renderSvgRequestSchema.parse(input);
  const startedAt = Date.now();

  const result = await new Promise<{ output: Buffer; stderr: string; code: number | null }>(
    (resolve, reject) => {
      const child = spawn(
        "java",
        [
          ...javaArgs,
          "-jar",
          jarPath,
          outputFormat === "svg" ? "-tsvg" : "-tpng",
          "-charset",
          "UTF-8",
          "-pipe",
        ],
        {
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      const chunks: Buffer[] = [];
      let stderr = "";

      child.stderr.setEncoding("utf8");

      child.stdout.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        resolve({ output: Buffer.concat(chunks), stderr, code });
      });

      child.stdin.write(input.plantUmlSource);
      child.stdin.end();
    },
  );

  if (result.code !== 0) {
    throw new Error(
      `PlantUML exited with code ${result.code ?? "unknown"}: ${result.stderr || "no stderr"}`,
    );
  }

  return {
    output: result.output,
    stderr: result.stderr,
    durationMs: Date.now() - startedAt,
  };
}

export async function renderSvgWithPlantUml(
  input: RenderSvgRequest,
  jarPath = DEFAULT_JAR_PATH,
): Promise<RenderSvgResponse> {
  renderSvgRequestSchema.parse(input);
  const result = await renderWithPlantUml(input, "svg", jarPath);
  const svg = result.output.toString("utf8").trim();

  if (!svg.includes("<svg")) {
    throw new Error(
      `PlantUML did not return SVG content: ${result.stderr || "empty output"}`,
    );
  }

  return renderSvgResponseSchema.parse({
    svg,
    renderMeta: {
      engine: "plantuml",
      generatedAt: new Date().toISOString(),
      sourceLength: input.plantUmlSource.length,
      durationMs: result.durationMs,
    },
  });
}

export async function renderPngWithPlantUml(
  input: RenderPngRequest,
  jarPath = DEFAULT_JAR_PATH,
): Promise<RenderPngResponse> {
  renderPngRequestSchema.parse(input);
  const result = await renderWithPlantUml(input, "png", jarPath);
  const pngSignature = result.output.subarray(0, 8).toString("hex");
  if (pngSignature !== "89504e470d0a1a0a") {
    throw new Error(
      `PlantUML did not return PNG content: ${result.stderr || "empty output"}`,
    );
  }

  return renderPngResponseSchema.parse({
    pngBase64: result.output.toString("base64"),
    renderMeta: {
      engine: "plantuml",
      generatedAt: new Date().toISOString(),
      sourceLength: input.plantUmlSource.length,
      durationMs: result.durationMs,
    },
  });
}

export async function renderPdfWithPlantUml(input: RenderPdfRequest): Promise<RenderPdfResponse> {
  renderPdfRequestSchema.parse(input);
  const startedAt = Date.now();
  const rendered = await renderSvgWithPlantUml(input);
  const pdf = await svgToVectorPdf(rendered.svg);
  return renderPdfResponseSchema.parse({
    pdfBase64: pdf.toString("base64"),
    renderMeta: { ...rendered.renderMeta, engine: "plantuml+svg-to-pdfkit", durationMs: Date.now() - startedAt },
  });
}

export async function createRenderServiceServer(options: RenderServerOptions = {}) {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: createCorsOriginChecker(
      "RENDER_SERVICE_CORS_ORIGINS",
      DEFAULT_LOCAL_CORS_ORIGINS,
    ),
  });

  app.get("/health", async () => {
    let jarAvailable = true;
    try {
      await access(DEFAULT_JAR_PATH);
    } catch {
      jarAvailable = false;
    }

    return {
      status: "ok",
      jarPath: DEFAULT_JAR_PATH,
      jarAvailable,
      pdfFontsReady: await pdfFontsReady(),
      renderConcurrency: positiveInteger(process.env.UML_RENDER_CONCURRENCY, 1),
      javaArgs: readJavaArgs(),
    };
  });
  const renderQueue = createConcurrencyQueue(
    positiveInteger(process.env.UML_RENDER_CONCURRENCY, 1),
  );
  const renderSvg = options.renderSvg ?? renderSvgWithPlantUml;
  const renderPng = options.renderPng ?? renderPngWithPlantUml;
  const renderPdf = options.renderPdf ?? renderPdfWithPlantUml;

  app.post("/render/svg", async (request, reply) => {
    try {
      const input = renderSvgRequestSchema.parse(request.body);
      const result = await renderQueue(() => renderSvg(input));
      return result;
    } catch (error) {
      request.log.error(error);
      reply.code(400);
      return {
        message: error instanceof Error ? error.message : "Unknown render error",
      };
    }
  });

  app.post("/render/png", async (request, reply) => {
    try {
      const input = renderPngRequestSchema.parse(request.body);
      const result = await renderQueue(() => renderPng(input));
      return result;
    } catch (error) {
      request.log.error(error);
      reply.code(400);
      return {
        message: error instanceof Error ? error.message : "Unknown render error",
      };
    }
  });

  app.post("/render/pdf", async (request, reply) => {
    try {
      const input = renderPdfRequestSchema.parse(request.body);
      return await renderQueue(() => renderPdf(input));
    } catch (error) {
      request.log.error(error);
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Unknown PDF render error" };
    }
  });

  return app;
}

async function start() {
  const app = await createRenderServiceServer();
  await app.listen({ host: DEFAULT_HOST, port: DEFAULT_PORT });
}

function resolveEntrypointPath(path: string) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function readCorsOrigins(envName: string, localDefaults: string[]) {
  const configured = process.env[envName]
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured && configured.length > 0) {
    return configured;
  }

  return process.env.NODE_ENV === "production" ? [] : localDefaults;
}

function createCorsOriginChecker(envName: string, localDefaults: string[]) {
  const allowedOrigins = new Set(readCorsOrigins(envName, localDefaults));

  return async (origin: string | undefined) => {
    if (!origin || allowedOrigins.has(origin)) {
      return true;
    }

    console.warn(
      `[cors] Rejected origin "${origin}". Configure ${envName} to allow it.`,
    );
    return false;
  };
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

if (isMainModule(import.meta.url)) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
