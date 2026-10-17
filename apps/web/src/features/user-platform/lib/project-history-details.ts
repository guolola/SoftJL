// Maps persisted run intent and snapshot artifacts to the five history operations.
import type { TFunction } from "i18next";
import { DESIGN_DIAGRAM_META, DIAGRAM_META, getDesignDiagramLabel, getDiagramLabel } from "../../../entities/diagram/model";
import type { PlatformRunSummary } from "../services/platform-api";

export const HISTORY_OPERATIONS = ["rules", "feasibility", "requirements", "design", "document"] as const;
export type HistoryOperation = typeof HISTORY_OPERATIONS[number];

export function getHistoryOperation(run: PlatformRunSummary): HistoryOperation | null {
  if (run.operationType) {
    const operations = {
      requirement_extraction: "rules", requirement_modeling: "requirements",
      feasibility_analysis: "feasibility", design_modeling: "design", document_generation: "document",
      unknown: null,
    } as const;
    return operations[run.operationType];
  }
  if (run.runKind === "feasibility" || run.runKind === "design" || run.runKind === "document") return run.runKind;
  if (run.runKind && run.runKind !== "requirements") return null;
  const stage = run.stage ?? "";
  // Selected targets preserve the user's intent even if extraction or rendering failed first.
  if (run.runKind === "requirements") {
    if (run.selectedDiagrams?.length || run.requestedDiagrams?.length) return "requirements";
    if (run.selectedDiagrams || stage === "extract_rules") return "rules";
    return "requirements";
  }
  if (/document|docx/.test(stage)) return "document";
  if (/context|implementation|business_flow|feasibility/.test(stage)) return "feasibility";
  if (/design/.test(stage)) return "design";
  if (stage === "extract_rules") return "rules";
  if (/generate_models|plantuml|render_svg|render_diagram|verify_diagram_visual/.test(stage)) return "requirements";
  return null;
}

export function historyDiagramLabel(id: string, design: boolean, t: TFunction) {
  const kind = id.split(":")[0]!;
  const label = design && Object.hasOwn(DESIGN_DIAGRAM_META, kind)
    ? getDesignDiagramLabel(kind as keyof typeof DESIGN_DIAGRAM_META, t)
    : Object.hasOwn(DIAGRAM_META, kind)
      ? getDiagramLabel(kind as keyof typeof DIAGRAM_META, t)
      : id;
  return kind === id ? label : `${label} (${id})`;
}
