// Supplies ordinary generation to the existing template cards, file library and Word editor page.
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocumentStyleSettings, StandardProjectState } from "@uml-platform/contracts";
import { InstructionDocumentsPage } from "../../documents/components/instruction-documents-page";
import { standardApi, waitForStandardRun } from "../services/standard-api";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { loadModelingReasoning } from "../../../shared/lib/modeling-reasoning";

export function StandardDocumentsPage({ projectId, state, disabled, refresh }: {
  projectId: string; state: StandardProjectState; disabled: boolean; refresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [activeDocumentId, setActiveDocumentId] = useState<string>();
  const abort = useRef<AbortController | null>(null);
  const adopted = useRef(false);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (disabled || adopted.current) return;
    adopted.current = true;
    const kinds = (["requirementsSpec", "softwareDesignSpec"] as const).filter(kind => state.documents?.[kind] && !state.documents[kind]!.documentId);
    if (!kinds.length) return;
    void (async () => { for (const kind of kinds) await standardApi.publishDocument(projectId, kind); await refresh(); })()
      .catch(() => floatingAlert.error(t("standardProject.documentSyncFailed")));
  }, [disabled, projectId, state.documents, refresh, t]);
  const onBack = useCallback(() => setActiveDocumentId(undefined), []);
  const generate = useCallback(async (kind: "requirementsSpec" | "softwareDesignSpec", style: DocumentStyleSettings) => {
    if (disabled || abort.current) return;
    const controller = new AbortController(); abort.current = controller;
    try {
      const started = await standardApi.start(projectId, { operation: kind, documentStyle: style, reasoning: loadModelingReasoning() });
      await refresh();
      const completed = await waitForStandardRun(projectId, started.state.run!.id, controller.signal);
      await refresh();
      return { documentId: completed.documents?.[kind]?.documentId };
    } catch (error) {
      if (!controller.signal.aborted) floatingAlert.error(error instanceof Error ? error.message : t("standardProject.documentGenerationFailed"), { id: `standard-project-${projectId}-error` });
      return undefined;
    } finally { if (abort.current === controller) abort.current = null; }
  }, [projectId, disabled, refresh, t]);
  const ready = Object.values(state.diagrams).some(diagram => diagram.status === "completed");
  const revision = Object.values(state.documents ?? {}).map(document => document.documentId ?? "").join(",");
  const ordinary = useMemo(() => ({ generate, onOpen: setActiveDocumentId, onBack,
    revision, disabled, blockedReason: disabled ? t("standardProject.generationBlocked") : ready ? null : t("standardProject.diagramsRequired") }), [generate, onBack, disabled, ready, revision, t]);
  return <InstructionDocumentsPage activeDocumentId={activeDocumentId} ordinary={ordinary} />;
}
