// Orchestrates document text, diagram image rendering, and DOCX export for document runs.
import { acceptRunOutput } from "../records/run-output-provenance.js";

import { createStageLifecycle } from "./shared/stage-lifecycle.js";
import { createRunLlmChunkHandlers } from "./shared/llm-chunk-events.js";
import { withRunReasoning } from "./shared/run-reasoning.js";
import {
  artifactReadyRunEventSchema,
  completedRunEventSchema,
  documentContentResultSchema,
  stageProgressRunEventSchema,
  stageStartedRunEventSchema,
  type DocumentRunSnapshot,
  type ProviderSettings,
  type StartDocumentRunRequest,
  type RunStage,
  type DocumentSection,
} from "@uml-platform/contracts";
import {
  buildGenerateDocumentContentPrompt,
  buildRepairDocumentContentPrompt,
} from "@uml-platform/prompts";
import { type LlmTransport } from "../../llm.js";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import { type PngRenderClient } from "../../adapters/render/png-render-client.js";
import { getDocumentContentResponseFormat } from "../../adapters/llm/response-formats/index.js";
import { formatParseError, parseJson } from "../../normalizers/json/parse-json.js";
import {
  buildDocumentContext,
  diagramPlantUmlForDocument,
  diagramSvgKindsForDocument,
  ensureDocumentDiagramSections,
  fallbackDocumentSections,
  findForbiddenDocumentPhrases,
  findUnsupportedDocumentClaims,
  mergeDocumentSectionsWithTemplate,
  sanitizeDocumentSections,
} from "../../documents/context/document-context.js";
import { renderDocumentBuffer } from "../../documents/render/document-renderer.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { throwIfRunCancelled } from "../records/run-cancellation.js";
import { assertRequirementBaselineAllowsDownstream } from "../baselines/requirement-baseline.js";
import { stageProgressValue } from "./shared/pipeline-events.js";
import { createMessages } from "./shared/llm-messages.js";
import { withConversationBranch } from "./shared/conversation-context.js";
import {
  collectTextResult,
  logFailedStructuredOutput,
} from "./shared/structured-output.js";

const MAX_DOCUMENT_CONTENT_REPAIR_ATTEMPTS = 2;

function normalizeDocumentContentOutput(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const record = raw as { sections?: unknown };
  if (!Array.isArray(record.sections)) return raw;
  return {
    ...record,
    sections: record.sections.map((section) => {
      if (!section || typeof section !== "object" || Array.isArray(section)) {
        return section;
      }
      const next = { ...(section as Record<string, unknown>) };
      if (next.table === null) delete next.table;
      if (next.diagramKind === null) delete next.diagramKind;
      return next;
    }),
  };
}

// LLM structured output repair keeps the document sections wire shape stable across retries.
async function generateDocumentSectionsWithRepair(
  record: RunRecord,
  input: StartDocumentRunRequest,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  chapter?: { index: number; sections: DocumentSection[]; outline: unknown },
) {
  const fullContext = buildDocumentContext(input);
  const knownKinds = new Set([...input.requirementModels, ...input.designModels].map((model) => model.diagramKind));
  const chapterKinds = new Set(chapter?.sections.flatMap((section) => section.diagramKind ? section.diagramKind.split(":").filter((part) => [...knownKinds].some((kind) => kind === part)) : []) ?? []);
  const sharedTerms = [...input.requirementModels, ...input.designModels].flatMap((model) => {
    const terms: string[] = [];
    const collect = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach(collect); return; }
      for (const [key, entry] of Object.entries(value)) {
        if (["name", "title"].includes(key) && typeof entry === "string") terms.push(entry);
        else if (entry && typeof entry === "object") collect(entry);
      }
    };
    collect(model); return terms;
  });
  const context = { ...(chapter ? {
    documentOutline: chapter.outline,
    chapterInstruction: "仅生成 canonicalSections 中的章节，术语必须与需求和完整目录一致，不得生成其他章节。",
    sharedTerms: [...new Set(sharedTerms)],
    ...fullContext,
    requirementModels: fullContext.requirementModels.filter((model) => chapterKinds.has(model.diagramKind)),
    designModels: fullContext.designModels.filter((model) => chapterKinds.has(model.diagramKind)),
  } : fullContext) };
  if (chapter) context.canonicalSections = chapter.sections.map(({ level, title, diagramKind, diagramModelId, table }) => ({ level, title, diagramKind, diagramModelId, tableHeaders: table?.headers }));
  let prompt = buildGenerateDocumentContentPrompt(input.documentKind, context);
  let previousOutput = "";
  let lastErrorMessage = "";
  const responseFormat = getDocumentContentResponseFormat(providerSettings);

  for (
    let attempt = 0;
    attempt <= MAX_DOCUMENT_CONTENT_REPAIR_ATTEMPTS;
    attempt += 1
  ) {
    throwIfRunCancelled(record);
    const content = await collectTextResult(
      llmTransport,
      providerSettings,
      createMessages(prompt),
      createRunLlmChunkHandlers({ record, stage: "generate_document_text", subtaskId: chapter ? `document:chapter:${chapter.index}` : undefined, subtaskLabel: chapter?.sections[0]?.title }),
      responseFormat,
    );
    previousOutput = content;

    try {
      const sections = documentContentResultSchema.parse(
        normalizeDocumentContentOutput(parseJson(content)),
      ).sections;
      const forbiddenPhrases = findForbiddenDocumentPhrases(sections);
      const unsupportedClaims = findUnsupportedDocumentClaims(input, sections);
      const chapterMismatch = chapter && (sections.length !== chapter.sections.length || chapter.sections.some((section, index) => section.title.trim() !== sections[index]?.title.trim() || section.level !== sections[index]?.level));
      if (forbiddenPhrases.length === 0 && unsupportedClaims.length === 0 && !chapterMismatch) {
        return sections;
      }

      lastErrorMessage = [
        chapterMismatch ? "章节必须完整且严格匹配 canonicalSections 的标题与目录" : "",
        forbiddenPhrases.length > 0
          ? `说明书正文包含禁用占位或跳转话术：${forbiddenPhrases.join("、")}`
          : "",
        unsupportedClaims.length > 0
          ? `说明书正文包含无来源事实：${unsupportedClaims.join("、")}`
          : "",
      ]
        .filter(Boolean)
        .join("；");
      if (attempt === MAX_DOCUMENT_CONTENT_REPAIR_ATTEMPTS) {
        // A deterministic template is safer than exporting unsupported claims
        // after the real provider exhausts its focused repair attempts.
        return chapter?.sections ?? fallbackDocumentSections(input);
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "generate_document_text",
          progress: stageProgressValue("generate_document_text"),
          message: `说明书正文包含占位、跳转或无来源事实，正在尝试改写（${attempt + 1}/${MAX_DOCUMENT_CONTENT_REPAIR_ATTEMPTS}）`,
        }),
      );

      prompt = buildRepairDocumentContentPrompt(
        input.documentKind,
        context,
        previousOutput,
        lastErrorMessage,
      );
    } catch (error) {
      logFailedStructuredOutput(
        "generate_document_text",
        providerSettings.model,
        error,
        content,
        attempt + 1,
      );
      lastErrorMessage = formatParseError(error);

      if (attempt === MAX_DOCUMENT_CONTENT_REPAIR_ATTEMPTS) {
        throw new Error(
          `generate_document_text structured output failed: ${lastErrorMessage}`,
        );
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "generate_document_text",
          progress: stageProgressValue("generate_document_text"),
          message: `说明书正文 JSON 结构不合法，正在尝试修复（${attempt + 1}/${MAX_DOCUMENT_CONTENT_REPAIR_ATTEMPTS}）`,
        }),
      );

      prompt = buildRepairDocumentContentPrompt(
        input.documentKind,
        context,
        previousOutput,
        lastErrorMessage,
      );
    }
  }

  throw new Error(
    `generate_document_text structured output failed: ${lastErrorMessage}`,
  );
}

// Each chapter owns its repair budget and conversation. Promise result ordering
// preserves the fixed template, regardless of the order providers finish in.
async function generateDocumentChapters(record: RunRecord, input: StartDocumentRunRequest, provider: ProviderSettings, transport: LlmTransport, template: DocumentSection[]) {
  const chapters: DocumentSection[][] = [];
  for (const section of template) {
    if (section.level === 1 || !chapters.length) chapters.push([]);
    chapters[chapters.length - 1]!.push(section);
  }
  const outline = template.map(({ level, title }) => ({ level, title }));
  const results: DocumentSection[][] = new Array(chapters.length);
  let next = 0;
  let failed = false;
  const concurrency = Math.max(1, Math.min(4, chapters.length));
  const workers = await Promise.allSettled(Array.from({ length: concurrency }, async () => {
    while (!failed && next < chapters.length) {
      throwIfRunCancelled(record);
      const index = next++;
      try {
        const generated = await withConversationBranch(`document:chapter:${index}`, () => generateDocumentSectionsWithRepair(record, input, provider, transport, { index, sections: chapters[index]!, outline }));
        results[index] = chapters[index]!.map((section, offset) => mergeDocumentSectionsWithTemplate([section], [generated[offset]!])[0]!);
      } catch (error) { failed = true; throw error; }
      emitEvent(record, stageProgressRunEventSchema.parse({ type: "stage_progress", stage: "generate_document_text", progress: 55, subtaskId: `document:chapter:${index}`, subtaskLabel: chapters[index]![0]!.title, subtaskStatus: "completed" }));
    }
  }));
  const failure = workers.find((worker) => worker.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return results.flat();
}

// DOCX assembly boundary: this pipeline prepares sections, render buffers, then emits document artifacts.
export async function runDocumentStagePipeline(
  record: RunRecord,
  input: StartDocumentRunRequest,
  documentLibrary: DocumentLibrary,
  workspaceId: string,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  pngRenderClient: PngRenderClient,
  onPreparedStage?: (stage: RunStage) => Promise<void>,
) {
  const snapshot = record.snapshot as DocumentRunSnapshot;
  llmTransport = withRunReasoning(llmTransport, snapshot.reasoning);
  snapshot.feasibilityImplementationPlan = input.feasibilityImplementationPlan;
  snapshot.feasibilityInputs = input.feasibilityInputs;
  assertRequirementBaselineAllowsDownstream(snapshot.requirementBaseline);
  const stages = createStageLifecycle(record);
  const updateStage = (stage: RunStage, message?: string) => {
    throwIfRunCancelled(record);
    stages.advance(stage);
    snapshot.currentStage = stage;
    snapshot.status = "running";
    emitEvent(record, stageStartedRunEventSchema.parse({ type: "stage_started", stage, tracksCompletion: true }));
    emitEvent(
      record,
      stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage,
        progress: stageProgressValue(stage),
        message,
      }),
    );
  };

  throwIfRunCancelled(record);
  updateStage("generate_document_text", "正在生成说明书正文");
  let sections = fallbackDocumentSections(input);
  if (input.useAiText && input.documentKind !== "feasibilityStudy") {
    const generatedSections = await generateDocumentChapters(
      record,
      input,
      providerSettings,
      llmTransport,
      sections,
    );
    throwIfRunCancelled(record);
    sections = generatedSections;
  }
  sections = ensureDocumentDiagramSections(input.documentKind, sections);
  sections = sanitizeDocumentSections(input, sections);
  // Retain whole-document checks after independently repairing every chapter.
  const issues = [...findForbiddenDocumentPhrases(sections), ...findUnsupportedDocumentClaims(input, sections)];
  if (issues.length) throw new Error(`说明书整篇校验失败：${issues.join("；")}`);
  snapshot.sections = sections;
  acceptRunOutput(snapshot, { kind: "sections", id: "sections" });
  // Demo observers describe the actual prepared sections; real runs omit this hook.
  await onPreparedStage?.("generate_document_text");

  updateStage("render_document_file", "正在写入说明书文件");
  await onPreparedStage?.("render_document_file");
  throwIfRunCancelled(record);
  const missingArtifacts: string[] = [];
  const buffer = await renderDocumentBuffer(
    input.documentKind,
    sections,
    diagramPlantUmlForDocument(input),
    diagramSvgKindsForDocument(input),
    pngRenderClient,
    missingArtifacts,
    input.documentStyle,
    input.feasibilityInputs,
  );
  throwIfRunCancelled(record);
  record.documentBuffer = buffer;
  const document = await documentLibrary.saveGeneratedDocument({
    workspaceId,
    projectId: record.metadata?.projectId ?? null,
    createdByUserId: record.metadata?.userId ?? null,
    documentKind: input.documentKind,
    sourceRunId: snapshot.runId,
    fileName: snapshot.fileName ?? `${input.documentKind}.docx`,
    mimeType: snapshot.mimeType,
    buffer,
  });
  throwIfRunCancelled(record);
  snapshot.documentId = document.id;
  snapshot.fileName = document.fileName;
  snapshot.mimeType = document.mimeType;
  snapshot.missingArtifacts = [...new Set(missingArtifacts)];
  snapshot.byteLength = buffer.byteLength;
  throwIfRunCancelled(record);
  snapshot.status = "completed";
  snapshot.error = null;
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "render_document_file",
      artifactKind: "document",
    }),
  );
  emitEvent(
    record,
    completedRunEventSchema.parse({
      type: "completed",
      snapshot,
    }),
  );
}
