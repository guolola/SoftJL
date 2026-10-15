// Wraps run start, repair, render, and provider-test endpoints for workspace repositories.
import type {
  DesignDiagramModelSpec,
  DiagramModelSpec,
  RepairRequirementRuleRequest,
  RepairRequirementRuleResponse,
  RepairRequirementRulesRequest,
  RepairRequirementRulesResponse,
  RenderStructuredModelResponse,
  RenderSvgResponse,
} from "@uml-platform/contracts";
import type { DiagramType } from "../../entities/diagram/model";
import type { ModelCapability } from "../../shared/lib/provider-model-display";
import { postJson } from "../api-client";
import { renderPngResponseSchema, renderPdfResponseSchema, type UmlDiagramKind } from "@uml-platform/contracts";
import { projectHeaders, requireProjectScope, withProjectHeaders } from "./project-scope";
import { runPayloadWithoutUnmanagedProviderSettings } from "./run-payload";
import type {
  ProviderSettingsInput,
  
  StartDesignRunInput,
  StartDocumentRunInput,
  StartRunInput,
} from "./start-inputs";

export async function exportDiagramRequest(input: { diagramKind: UmlDiagramKind; plantUmlSource: string; format: "png" | "pdf" }, projectId: string | null, signal?: AbortSignal): Promise<Blob> {
  const scopedProjectId = requireProjectScope(projectId);
  const payload = await postJson<unknown>(`/api/render/${input.format}`, {
    diagramKind: input.diagramKind, plantUmlSource: input.plantUmlSource,
  }, { signal, headers: projectHeaders(scopedProjectId), errorKey: "diagrams.detail.downloadFailed" });
  const base64 = input.format === "png" ? renderPngResponseSchema.parse(payload).pngBase64 : renderPdfResponseSchema.parse(payload).pdfBase64;
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  const valid = input.format === "png"
    ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
    : new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
  if (!valid) throw new Error("Invalid diagram download content");
  return new Blob([bytes], { type: input.format === "png" ? "image/png" : "application/pdf" });
}

export async function repairRequirementRuleRequest(
  input: RepairRequirementRuleRequest,
  projectId: string | null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return postJson<RepairRequirementRuleResponse>(
    "/api/runs/requirement-rule-repair",
    runPayloadWithoutUnmanagedProviderSettings({
      ...input,
      projectId: scopedProjectId,
    }),
    {
      errorKey: "errors.operations.repairRule",
      headers: projectHeaders(scopedProjectId),
    },
  );
}

export async function repairRequirementRulesRequest(
  input: RepairRequirementRulesRequest,
  projectId: string | null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return postJson<RepairRequirementRulesResponse>(
    "/api/runs/requirement-rule-repairs",
    runPayloadWithoutUnmanagedProviderSettings({
      ...input,
      projectId: scopedProjectId,
    }),
    {
      errorKey: "errors.operations.repairRules",
      headers: projectHeaders(scopedProjectId),
    },
  );
}

export async function startRequirementRunRequest(
  input: StartRunInput,
  projectId: string | null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return postJson<{ runId: string }>(
    "/api/runs",
    runPayloadWithoutUnmanagedProviderSettings({
      projectId: scopedProjectId,
      ...(input.selectedDiagrams.length === 0 ? { requirementText: input.requirementText } : {}),
      selectedDiagrams: input.selectedDiagrams,
      requestedDiagrams: input.requestedDiagrams,
      dependencyDiagrams: input.dependencyDiagrams,
      analysisTargetUseCaseIds: input.analysisTargetUseCaseIds ?? [],
      providerSettings: input.providerSettings,
    }),
    {
      errorKey: "errors.operations.startRequirements",
      headers: projectHeaders(scopedProjectId),
    },
  );
}

export async function startDesignRunRequest(
  input: StartDesignRunInput,
  projectId: string | null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return postJson<{ runId: string }>(
    "/api/design-runs",
    runPayloadWithoutUnmanagedProviderSettings({
      projectId: scopedProjectId,
      selectedDiagrams: input.selectedDiagrams,
      requestedDiagrams: input.requestedDiagrams,
      providerSettings: input.providerSettings,
    }),
    {
      errorKey: "errors.operations.startDesign",
      headers: projectHeaders(scopedProjectId),
    },
  );
}



export async function startDocumentRunRequest(
  input: StartDocumentRunInput,
  projectId: string | null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return postJson<{ runId: string }>(
    "/api/document-runs",
    runPayloadWithoutUnmanagedProviderSettings({
      projectId: scopedProjectId,
      documentKind: input.documentKind,
      providerSettings: input.providerSettings,
      useAiText: input.useAiText,
      documentStyle: input.documentStyle,
    }),
    withProjectHeaders(scopedProjectId, {
      errorKey: "errors.operations.startDocument",
    }),
  );
}

export async function renderPlantUmlRequest(
  diagramKind: DiagramType,
  plantUmlSource: string,
  projectId: string | null,
) {
  const scopedProjectId = requireProjectScope(projectId);
  return postJson<RenderSvgResponse>(
    "/api/render/svg",
    {
      diagramKind,
      plantUmlSource,
    },
    {
      errorKey: "errors.operations.renderDiagram",
      headers: projectHeaders(scopedProjectId),
    },
  );
}

export async function renderStructuredModelRequest(
  model: DiagramModelSpec | DesignDiagramModelSpec,
  projectId: string | null,
  stage: "feasibility" | "requirements" | "design",
) {
  const scopedProjectId = requireProjectScope(projectId);
  return postJson<RenderStructuredModelResponse>(
    "/api/render/model",
    { model, stage },
    {
      errorKey: "errors.operations.redrawModel",
      headers: projectHeaders(scopedProjectId),
    },
  );
}

export async function testProviderSettingsRequest(
  providerSettings: ProviderSettingsInput,
) {
  const payload = await postJson<{
    ok?: boolean;
    message?: string;
    capability?: ModelCapability;
  }>("/api/provider/test", providerSettings, {
    errorKey: "errors.operations.providerTest",
  });
  if (!payload.ok || !payload.capability) {
    throw new Error(payload.message ?? "连接测试失败");
  }
  return {
    ok: true,
    message: payload.message ?? "Provider connection ok",
    capability: payload.capability,
  };
}
