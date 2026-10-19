// Keeps local freshness receipts aligned with the same dependency rules used at API storage boundaries.
import { invalidateDesignDependents, snapshotInputFingerprint } from "@uml-platform/contracts";
import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import type { WorkspaceRecord } from "../../../entities/workspace/model";

type FreshnessState = Pick<WorkspaceRecord, "requirementText" | "rules" | "requirementBaseline" | "rulesVersion" | "requirementInputFingerprint" |
  "models" | "requirementModelTraceability" | "designModels" | "designModelTraceability" |
  "diagramVersions" | "diagramInputFingerprints" | "designInputFingerprints">;

export function useDependentFreshness(input: FreshnessState, {
  setDiagramInputFingerprints, setDesignInputFingerprints,
}: {
  setDiagramInputFingerprints: Dispatch<SetStateAction<WorkspaceRecord["diagramInputFingerprints"]>>;
  setDesignInputFingerprints: Dispatch<SetStateAction<WorkspaceRecord["designInputFingerprints"]>>;
}, hasUncommittedDraft = false) {
  const { requirementText, rules, requirementBaseline, rulesVersion, models, requirementModelTraceability,
    designModels, designModelTraceability, diagramVersions, diagramInputFingerprints, designInputFingerprints, requirementInputFingerprint } = input;
  const current = useMemo(() => ({ requirementText, rules, requirementBaseline, rulesVersion, models, requirementModelTraceability,
    designModels, designModelTraceability, diagramVersions, diagramInputFingerprints, designInputFingerprints, requirementInputFingerprint }),
  [requirementText, rules, requirementBaseline, rulesVersion, models, requirementModelTraceability,
    designModels, designModelTraceability, diagramVersions, diagramInputFingerprints, designInputFingerprints, requirementInputFingerprint]);
  const previous = useRef<FreshnessState | null>(null);
  const resolved = useMemo(() => previous.current && !hasUncommittedDraft
    ? invalidateDesignDependents(previous.current, current) as FreshnessState
    : current, [current, hasUncommittedDraft]);
  useEffect(() => {
    // A text draft may be reverted; it must not permanently invalidate saved receipts.
    if (hasUncommittedDraft) return;
    previous.current = resolved;
    if (snapshotInputFingerprint(current.diagramInputFingerprints) !== snapshotInputFingerprint(resolved.diagramInputFingerprints))
      setDiagramInputFingerprints(resolved.diagramInputFingerprints);
    if (snapshotInputFingerprint(current.designInputFingerprints) !== snapshotInputFingerprint(resolved.designInputFingerprints))
      setDesignInputFingerprints(resolved.designInputFingerprints);
  }, [current, resolved, setDiagramInputFingerprints, setDesignInputFingerprints, hasUncommittedDraft]);
  return { diagramInputFingerprints: resolved.diagramInputFingerprints, designInputFingerprints: resolved.designInputFingerprints };
}
