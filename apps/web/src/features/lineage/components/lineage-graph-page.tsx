// Composes lineage data and business actions around the supplied workflow canvas.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { PageContainer, PageHeader } from '../../../shared/template/layout/page';
import { getDesignDiagramDescription, getDesignDiagramLabel, getDiagramDescription, getDiagramLabel } from '../../../entities/diagram/model';
import type { PlatformRunSummary, PlatformProjectMember, PlatformDocument } from '../../user-platform/services/platform-api';
import { useLineageGeneration } from '../hooks/use-lineage-generation';
import { useWorkspaceSession } from '../../workspace-session/state';
import { useWorkspaceShell } from '../../workspace-shell/state';
import { buildLineageGraph, type LineageGraph, type LineageNode, type LineageNodeStatus } from '../lib/lineage-graph-model';
import { LineageWorkflowCanvas } from './lineage-workflow-canvas';
function lineageStatusKey(status: LineageNodeStatus) {
  return status === "not-generated" ? "not_generated" : status;
}

function localizeLineageGraph(graph: LineageGraph, t: TFunction): LineageGraph {
  const actionByStatus: Record<LineageNodeStatus, string> = {
    "not-generated": "generate",
    current: "regenerate",
    stale: "update",
    error: "retry",
    running: "progress",
    interrupted: "retry",
  };
  const categoryKeys: Record<string, string> = {
    "\u4e1a\u52a1\u89c4\u5219": "business", "\u529f\u80fd\u9700\u6c42": "functional",
    "\u5916\u90e8\u63a5\u53e3": "externalInterface", "\u754c\u9762\u9700\u6c42": "interface",
    "\u6570\u636e\u9700\u6c42": "data", "\u975e\u529f\u80fd\u9700\u6c42": "nonFunctional",
    "\u90e8\u7f72\u9700\u6c42": "deployment", "\u5f02\u5e38\u5904\u7406": "exception",
  };
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const stageKey = node.stage.replace("-", "_");
      const reasonKey = lineageStatusKey(node.status);
      let label = node.label;
      let description = node.description;
      let eyebrow = node.eyebrow;
      if (node.kind === "requirement-model" && node.payload?.diagramKind) {
        label = getDiagramLabel(node.payload.diagramKind, t);
        description = getDiagramDescription(node.payload.diagramKind, t);
      } else if (node.kind === "design-model" && node.payload?.designDiagramKind) {
        label = getDesignDiagramLabel(node.payload.designDiagramKind, t);
        description = getDesignDiagramDescription(node.payload.designDiagramKind, t);
      } else if (node.kind === "document" && node.payload?.documentKind) {
        const productKey = node.payload.documentKind === "requirementsSpec"
          ? "requirementsSpec"
          : "softwareDesignSpec";
        label = t(`lineage.products.${productKey}.label`);
        description = t(`lineage.products.${productKey}.description`);
      } else if (node.kind === "rule" && node.id.endsWith(":empty")) {
        label = t("lineage.products.emptyRules.label");
        description = t("lineage.products.emptyRules.description");
      } else if (node.kind === "rule" && categoryKeys[eyebrow]) {
        eyebrow = t(`requirements.categories.${categoryKeys[eyebrow]}`);
      }
      return {
        ...node,
        stageLabel: t(`lineage.stages.${stageKey}`),
        label,
        eyebrow,
        description,
        reason: t(`lineage.reasons.${reasonKey}`),
        actionLabel: t(`lineage.actions.${actionByStatus[node.status]}`),
      };
    }),
  };
}


const EMPTY_RUNS: PlatformRunSummary[] = [];
const EMPTY_MEMBERS: PlatformProjectMember[] = [];
const EMPTY_DOCUMENTS: PlatformDocument[] = [];
export function LineageGraphPage({ onViewArtifact, projectId, projectRuns = EMPTY_RUNS, members = EMPTY_MEMBERS, documents = EMPTY_DOCUMENTS }: { onViewArtifact?: () => void; projectId?: string; projectRuns?: PlatformRunSummary[]; members?: PlatformProjectMember[]; documents?: PlatformDocument[] }) {
  const { t, i18n } = useTranslation();
  const session = useWorkspaceSession();
  const workspaceShell = useWorkspaceShell();
  const graph = useMemo(() => localizeLineageGraph(buildLineageGraph({ ...session, projectRuns }), t), [i18n.resolvedLanguage, projectRuns, session, t]);
  const generation = useLineageGeneration(projectId, graph, session, projectRuns, members, documents);
  const [canvasHeight, setCanvasHeight] = useState<number>();
  const canvasFrameRef = useRef<HTMLDivElement>(null);
  // Fit below the real header; wrapped mobile controls and window resizing share this limit.
  useLayoutEffect(() => {
    const frame = canvasFrameRef.current;
    if (!frame) return;
    const resize = () => setCanvasHeight(Math.max(0, window.innerHeight - Math.max(0, frame.getBoundingClientRect().top) - 24));
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    if (frame.previousElementSibling) observer?.observe(frame.previousElementSibling);
    window.addEventListener('resize', resize);
    resize();
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize); };
  }, []);
  const handleViewArtifact = useCallback(
    (node: LineageNode) => {
      if (node.kind === "rule") {
        workspaceShell.openSystemRequirements();
      } else if (node.kind === "requirement-model" && node.payload?.diagramKind) {
        workspaceShell.openDiagram(node.payload.diagramKind, undefined, node.label);
      } else if (node.kind === "design-model" && node.payload?.designDiagramKind) {
        workspaceShell.openDesignDiagram(
          node.payload.designDiagramKind,
          undefined,
          node.label,
        );
      } else if (node.kind === "document") {
        workspaceShell.openDocumentsHome();
      }
      onViewArtifact?.();
    },
    [onViewArtifact, workspaceShell],
  );

  const handlePrimaryAction = useCallback(
    (node: LineageNode) => {
      if (node.status === "running") return;
      if (node.kind === "rule") {
        void session.generateRules();
        return;
      }
      if (node.kind === "requirement-model" && node.payload?.diagramKind) {
        void session.generateDiagrams([node.payload.diagramKind]);
        return;
      }
      if (node.kind === "design-model" && node.payload?.designDiagramKind) {
        void session.generateDesignDiagrams([node.payload.designDiagramKind]);
        return;
      }

      if (node.payload?.documentKind === "requirementsSpec") {
        void session.generateRequirementsSpec();
      }
      if (node.payload?.documentKind === "softwareDesignSpec") {
        void session.generateSoftwareDesignSpec();
      }
      if (node.payload?.documentKind === "feasibilityStudy") {
        void session.generateFeasibilityStudy();
      }
    },
    [session],
  );

  return <PageContainer className='flex min-w-0 flex-col gap-6'>
    <section aria-label={t('lineage.title')} className='flex min-w-0 flex-col gap-6'>
      <PageHeader title={t('lineage.title')} description={t('lineage.description')} />
      <div ref={canvasFrameRef} data-testid='lineage-content' style={{ height: canvasHeight }} className='h-[calc(100dvh-13rem)] min-h-0 min-w-0'>
        <LineageWorkflowCanvas graph={graph} generation={generation} onPrimaryAction={handlePrimaryAction} onViewArtifact={handleViewArtifact} />
      </div>
    </section>
  </PageContainer>;
}
