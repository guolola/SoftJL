// Provides manual model save and rerender actions for workspace session state.
import { assertValidModel, deriveTableModel } from "@uml-platform/contracts";
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import type {
  DesignDiagramModelSpec,
  DiagramModelSpec,
} from "@uml-platform/contracts";
import {
  getRequirementModelId,
  findRequirementModelByKind,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import type {
  ManualModelEditStatus,
  WorkspaceRecord,
} from "../../../entities/workspace/model";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  pruneTraceabilityForDesignModels,
  pruneTraceabilityForRequirementModels,
} from "./traceability-pruning";

interface ManualModelEditActionsInput {
  designModelTraceability: WorkspaceRecord["designModelTraceability"];
  designModels: WorkspaceRecord["designModels"];
  models: WorkspaceRecord["models"];
  repository: WorkspaceRepository;
  requirementModelTraceability: WorkspaceRecord["requirementModelTraceability"];
  setDesignDiagramErrors: Dispatch<
    SetStateAction<WorkspaceRecord["designDiagramErrors"]>
  >;
  setDesignModels: Dispatch<SetStateAction<WorkspaceRecord["designModels"]>>;
  setDesignModelTraceability: Dispatch<
    SetStateAction<WorkspaceRecord["designModelTraceability"]>
  >;
  setDesignPlantUml: Dispatch<SetStateAction<WorkspaceRecord["designPlantUml"]>>;
  setDesignSvgArtifacts: Dispatch<
    SetStateAction<WorkspaceRecord["designSvgArtifacts"]>
  >;
  setDiagramErrors: Dispatch<SetStateAction<WorkspaceRecord["diagramErrors"]>>;
  setGeneratedDesignDiagrams: Dispatch<SetStateAction<DesignDiagramType[]>>;
  setGeneratedDiagrams: Dispatch<SetStateAction<DiagramType[]>>;
  setManualModelEditStatus: Dispatch<
    SetStateAction<WorkspaceRecord["manualModelEditStatus"]>
  >;
  setModels: Dispatch<SetStateAction<WorkspaceRecord["models"]>>;
  setPlantUml: Dispatch<SetStateAction<WorkspaceRecord["plantUml"]>>;
  setRequirementModelTraceability: Dispatch<
    SetStateAction<WorkspaceRecord["requirementModelTraceability"]>
  >;
  setSvgArtifacts: Dispatch<SetStateAction<WorkspaceRecord["svgArtifacts"]>>;
  setVisualReviews: Dispatch<SetStateAction<NonNullable<WorkspaceRecord["visualReviews"]>>>;
}

export function useManualModelEditActions({
  designModelTraceability,
  designModels,
  models,
  repository,
  requirementModelTraceability,
  setDesignDiagramErrors,
  setDesignModels,
  setDesignModelTraceability,
  setDesignPlantUml,
  setDesignSvgArtifacts,
  setDiagramErrors,
  setGeneratedDesignDiagrams,
  setGeneratedDiagrams,
  setManualModelEditStatus,
  setModels,
  setPlantUml,
  setRequirementModelTraceability,
  setSvgArtifacts,
  setVisualReviews,
}: ManualModelEditActionsInput) {
  const { t } = useTranslation();
  const createManualEditStatus = useCallback(
    (status: "dirty" | "rerendered") => {
      const now = new Date().toISOString();
      return {
        status,
        warning:
          status === "dirty"
            ? "模型已手动修改，可能与前置需求映射不一致。保存后会自动更新当前图。"
            : null,
        editedAt: now,
        ...(status === "rerendered" ? { rerenderedAt: now } : {}),
      } satisfies ManualModelEditStatus;
    },
    [],
  );

  const saveRequirementModelEdit = useCallback(
    async (diagramKind: DiagramType, model: DiagramModelSpec) => {
      assertValidModel(model, "requirements");
      const status = createManualEditStatus("dirty");
      const modelKey = getRequirementModelId(model);
      const nextModels = { ...models, [modelKey]: model };
      const prunedTraceability = pruneTraceabilityForRequirementModels({
        models: nextModels,
        requirementModelTraceability,
        designModelTraceability,
      });
      setModels(nextModels);
      setRequirementModelTraceability(
        prunedTraceability.requirementModelTraceability,
      );
      setDesignModelTraceability(prunedTraceability.designModelTraceability);
      setManualModelEditStatus((current) => ({
        ...current,
        [modelKey]: status,
      }));
      await repository.saveRequirementModelEdit?.(
        diagramKind,
        model,
        status,
        prunedTraceability,
      );
    },
    [
      createManualEditStatus,
      designModelTraceability,
      models,
      repository,
      requirementModelTraceability,
      setDesignModelTraceability,
      setManualModelEditStatus,
      setModels,
      setRequirementModelTraceability,
    ],
  );

  const saveDesignModelEdit = useCallback(
    async (modelId: string, model: DesignDiagramModelSpec) => {
      assertValidModel(model, "design");
      if (model.diagramKind === "table") model = deriveTableModel(model);
      const status = createManualEditStatus("dirty");
      const nextDesignModels = { ...designModels, [modelId]: model };
      const prunedDesignTraceability = pruneTraceabilityForDesignModels({
        designModels: nextDesignModels,
        models,
        designModelTraceability,
      });
      setDesignModels(nextDesignModels);
      setDesignModelTraceability(prunedDesignTraceability);
      setManualModelEditStatus((current) => ({
        ...current,
        [modelId]: status,
      }));
      await repository.saveDesignModelEdit?.(modelId, model, status, {
        designModelTraceability: prunedDesignTraceability,
      });
    },
    [
      createManualEditStatus,
      designModelTraceability,
      designModels,
      models,
      repository,
      setDesignModels,
      setDesignModelTraceability,
      setManualModelEditStatus,
    ],
  );

  const rerenderRequirementModel = useCallback(
    async (
      diagramKind: DiagramType,
      modelOverride?: DiagramModelSpec,
      options?: { toastMessage?: string | null },
    ) => {
      const model = modelOverride ?? findRequirementModelByKind(models, diagramKind);
      if (!model) {
        throw new Error(t("diagrams.detail.requirementModelMissing"));
      }
      const modelKey = getRequirementModelId(model);
      if (!repository.renderStructuredModel) {
        throw new Error(t("diagrams.detail.rerenderUnsupported"));
      }
      const rendered = await repository.renderStructuredModel(model, "requirements");
      const status = createManualEditStatus("rerendered");
      const svgArtifact = {
        diagramKind,
        modelId: "modelId" in model ? model.modelId : undefined,
        svg: rendered.svg,
        renderMeta: rendered.renderMeta,
      };
      setPlantUml((current) => ({
        ...current,
        [modelKey]: rendered.plantUmlSource,
      }));
      setSvgArtifacts((current) => ({ ...current, [modelKey]: svgArtifact }));
      setDiagramErrors((current) => {
        const next = { ...current };
        delete next[modelKey];
        delete next[diagramKind];
        return next;
      });
      setGeneratedDiagrams((current) =>
        current.includes(diagramKind) ? current : [...current, diagramKind],
      );
      setManualModelEditStatus((current) => ({
        ...current,
        [modelKey]: status,
      }));
      setVisualReviews((current) => {
        const next = { ...current };
        delete next[`requirements:${modelKey}`];
        return next;
      });
      await repository.saveManualModelRerender?.(modelKey, status, {
        plantUmlSource: rendered.plantUmlSource,
        svgArtifact,
      });
      if (options?.toastMessage !== null) {
        floatingAlert.message(options?.toastMessage ?? t("diagrams.detail.rerendered"));
      }
    },
    [
      createManualEditStatus,
      models,
      repository,
      setDiagramErrors,
      setGeneratedDiagrams,
      setManualModelEditStatus,
      setPlantUml,
      setSvgArtifacts,
      setVisualReviews,
    ],
  );

  const rerenderDesignModel = useCallback(
    async (
      modelId: string,
      modelOverride?: DesignDiagramModelSpec,
      options?: { toastMessage?: string | null },
    ) => {
      const model = modelOverride ?? designModels[modelId];
      if (!model) {
        throw new Error(t("diagrams.detail.designModelMissing"));
      }
      if (!repository.renderStructuredModel) {
        throw new Error(t("diagrams.detail.rerenderUnsupported"));
      }
      const rendered = await repository.renderStructuredModel(model, "design");
      const status = createManualEditStatus("rerendered");
      const svgArtifact = {
        diagramKind: model.diagramKind,
        modelId: "modelId" in model ? model.modelId : undefined,
        svg: rendered.svg,
        renderMeta: rendered.renderMeta,
      };
      setDesignPlantUml((current) => ({
        ...current,
        [modelId]: rendered.plantUmlSource,
      }));
      setDesignSvgArtifacts((current) => ({
        ...current,
        [modelId]: svgArtifact,
      }));
      setDesignDiagramErrors((current) => {
        const next = { ...current };
        delete next[model.diagramKind];
        return next;
      });
      setGeneratedDesignDiagrams((current) =>
        current.includes(model.diagramKind)
          ? current
          : [...current, model.diagramKind],
      );
      setManualModelEditStatus((current) => ({
        ...current,
        [modelId]: status,
      }));
      setVisualReviews((current) => {
        const next = { ...current };
        delete next[`design:${modelId}`];
        return next;
      });
      await repository.saveManualModelRerender?.(modelId, status, {
        plantUmlSource: rendered.plantUmlSource,
        svgArtifact,
      });
      if (options?.toastMessage !== null) {
        floatingAlert.message(options?.toastMessage ?? t("diagrams.detail.rerendered"));
      }
    },
    [
      createManualEditStatus,
      designModels,
      repository,
      setDesignDiagramErrors,
      setDesignPlantUml,
      setDesignSvgArtifacts,
      setVisualReviews,
      setGeneratedDesignDiagrams,
      setManualModelEditStatus,
    ],
  );

  return {
    rerenderDesignModel,
    rerenderRequirementModel,
    saveDesignModelEdit,
    saveRequirementModelEdit,
  };
}
