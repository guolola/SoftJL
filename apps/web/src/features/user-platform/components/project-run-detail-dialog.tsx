// Loads one historical snapshot and presents its own targets, accepted outputs, and failures.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../../shared/ui/alert";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";
import { localizeCaughtFailure, localizeRunFailure } from "../../../shared/i18n/api-errors";
import { getHistoryOperation, historyDiagramLabel } from "../lib/project-history-details";
import { platformApi, type PlatformRunSummary } from "../services/platform-api";
import { runTokenConsumptionPresentation } from "../lib/run-token-consumption";

type RunDetail = Awaited<ReturnType<typeof platformApi.getProjectRun>>;

export function ProjectRunDetailDialog({ projectId, run, onClose }: {
  projectId: string;
  run: PlatformRunSummary;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<RunDetail>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    setDetail(undefined);
    // Closing or switching records must not display a late response from the previous run.
    void platformApi.getProjectRun(projectId, run.runId, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setDetail(value); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(localizeCaughtFailure(error, t("projectShell.historyUi.detailLoadFailed")));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId, run.runId, attempt, t]);

  const current = detail?.run ?? run;
  const tokenUsage = runTokenConsumptionPresentation(current.tokenConsumption ?? run.tokenConsumption);
  const snapshot = detail?.snapshot;
  const operation = getHistoryOperation(current);
  const design = operation === "design";
  const label = (id: string) => historyDiagramLabel(id, design, t, snapshot);
  const operationLabel = t(`projectShell.historyUi.operations.${operation ?? "requirements"}`);
  const artifactLabel = (id: string) => t(`projectShell.historyUi.artifacts.${id}`, { defaultValue: id });
  const documentKind = snapshot && "documentKind" in snapshot ? snapshot.documentKind : current.documentKind;
  const targets = snapshot && "selectedArtifacts" in snapshot
    ? snapshot.selectedArtifacts.map(artifactLabel)
    : documentKind
      ? [t(`projectShell.historyUi.documentKinds.${documentKind}`)]
      : operation === "rules"
        ? [operationLabel]
        : ((snapshot && "selectedDiagrams" in snapshot ? snapshot.selectedDiagrams : current.selectedDiagrams) ?? []).map(label);
  const outputs: string[] = [];
  // The API boundary requires explicit receipts before displaying accepted outputs.
  const accepted = (kind: string, id?: string) => snapshot?.outputManifest.some(
    (output) => output.kind === kind && (id === undefined || output.id === id),
  );
  if (snapshot) {
    // Quick history lists only artifacts attributed to this accepted message.
    if (operation === "quick" && "standardRun" in snapshot && snapshot.standardRun) {
      outputs.push(...snapshot.standardRun.artifacts.filter(item => snapshot.outputManifest.some(output => output.id === item.id))
        .map(item => item.title));
    }
    if (operation === "rules" && "rules" in snapshot) {
      outputs.push(...snapshot.rules.filter((rule) => accepted("rule", rule.id)).map((rule) => `${rule.id} · ${rule.text}`));
    }
    if ((operation === "requirements" || design) && "models" in snapshot) {
      outputs.push(...snapshot.models.filter((model) =>
        snapshot.selectedDiagrams.some((kind) => kind === model.diagramKind) && accepted("model", model.modelId ?? model.diagramKind),
      ).map((model) => `${label(model.diagramKind)} · ${model.title}`));
    }
    if ("selectedArtifacts" in snapshot) {
      if (snapshot.selectedArtifacts.includes("context") && snapshot.contextModel && accepted("context")) outputs.push(artifactLabel("context"));
      if (snapshot.selectedArtifacts.includes("business-flow") && snapshot.businessFlow && accepted("businessFlow")) outputs.push(artifactLabel("business-flow"));
      if (snapshot.selectedArtifacts.includes("implementation") && snapshot.implementationPlan && accepted("implementationPlan")) outputs.push(artifactLabel("implementation"));
    }
    if ("documentKind" in snapshot) {
      if (snapshot.fileName && accepted("document")) outputs.push(snapshot.fileName);
      if (accepted("sections") || accepted("document")) outputs.push(...snapshot.sections.map((section) => section.title));
    }
  }
  const primaryError = snapshot?.error ?? current.error;
  const failureFallback = t("errors.codes.RUN_INTERNAL_ERROR");
  const errors = [primaryError || current.errorMessage ? localizeRunFailure(primaryError ?? current.errorMessage, failureFallback) : null];
  const diagramErrors = snapshot && "diagramErrors" in snapshot
    ? Object.entries(snapshot.diagramErrors).flatMap(([id, value]) => value ? [{ diagramId: id, ...value, message: value.error.message }] : [])
    : current.diagramErrorSummary ?? [];
  errors.push(...diagramErrors.map((item) => `${label(item.diagramId)} · ${localizeRunFailure(item.error ?? item.message, failureFallback)}`));
  const missing = snapshot && "missingArtifacts" in snapshot ? snapshot.missingArtifacts : current.missingArtifactSummary ?? [];
  errors.push(...missing.map((item) => t("projectShell.historyUi.missingArtifact", { artifact: item })));
  const errorMessages = [...new Set(errors.filter((error): error is string => Boolean(error)))];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("projectShell.historyUi.detailTitle")}</DialogTitle>
          <DialogDescription>{t("projectShell.historyUi.detailDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-4 overflow-auto pr-1 text-sm">
          <section className="grid gap-2">
            <h3 className="font-semibold">{t("projectShell.historyUi.targets")}</h3>
            <p>{targets.join("、") || t("projectShell.historyUi.noTargets")}</p>
          </section>
          <section className="grid gap-2" aria-label={t("projectShell.historyUi.tokens.title")}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{t("projectShell.historyUi.tokens.title")}</h3>
              {tokenUsage.partial && <Badge variant="outline" className="text-warning">{t("projectShell.historyUi.tokens.partial")}</Badge>}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {Object.entries(tokenUsage.metrics).map(([kind, value]) => <div key={kind} className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">{t(`projectShell.historyUi.tokens.${kind}`)}</dt>
                <dd className="font-mono tabular-nums">{value ?? t("projectShell.historyUi.tokens.unknown")}</dd>
              </div>)}
            </dl>
            {tokenUsage.calls > 0 && <p className="text-xs text-muted-foreground">{t("projectShell.historyUi.tokens.calls", { count: tokenUsage.calls })}</p>}
            {tokenUsage.unreportedCalls > 0 && <p className="text-xs text-warning">{t(tokenUsage.partial ? "projectShell.historyUi.tokens.partialNotice" : "projectShell.historyUi.tokens.unreportedNotice", { count: tokenUsage.unreportedCalls })}</p>}
          </section>
          {loading && <p role="status">{t("projectShell.historyUi.detailLoading")}</p>}
          {snapshot?.publicationSkipped && <Alert>{snapshot.publicationSkipped}</Alert>}
          {loadError && <Alert variant="destructive"><p>{loadError}</p><Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>{t("projectShell.historyUi.reloadDetails")}</Button></Alert>}
          {!loading && !loadError && <section className="grid gap-2">
            <h3 className="font-semibold">{t("projectShell.historyUi.outputs")}</h3>
            {!snapshot ? <p className="text-muted-foreground">{t("projectShell.historyUi.noSnapshot")}</p>
              : <>
                {outputs.length ? <ul className="list-disc space-y-2 pl-5">{outputs.map((output, index) => <li key={index} className="break-words whitespace-pre-wrap">{output}</li>)}</ul>
                  : <p className="text-muted-foreground">{t("projectShell.historyUi.noOutputs")}</p>}
              </>}
          </section>}
          <section className="grid gap-2">
            <h3 className="font-semibold">{t("projectShell.historyUi.errors")}</h3>
            {errorMessages.length ? errorMessages.map((error) => <Alert key={error} variant="destructive" className="break-words whitespace-pre-wrap">{error}</Alert>)
              : !loading && !loadError && <p className="text-muted-foreground">{t("projectShell.historyUi.noErrors")}</p>}
          </section>
        </div>
        <DialogFooter><Button onClick={onClose}>{t("common.close")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
