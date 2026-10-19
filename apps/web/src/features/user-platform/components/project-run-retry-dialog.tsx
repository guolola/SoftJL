// Confirms the saved failure scope before submitting a historical run retry.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "../../../shared/ui/alert";
import { Button } from "../../../shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";
import { localizeCaughtFailure } from "../../../shared/i18n/api-errors";
import { hasHistoryRetryFailure, historyRetryTargets } from "../lib/project-history-details";
import { platformApi, type PlatformRunSummary } from "../services/platform-api";

type RunDetail = Awaited<ReturnType<typeof platformApi.getProjectRun>>;

export function ProjectRunRetryDialog({ projectId, run, canStartRuns, onClose, onRetried }: {
  projectId: string;
  run: PlatformRunSummary;
  canStartRuns: boolean;
  onClose: () => void;
  onRetried: () => void;
}) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<RunDetail>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submissionPending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    setDetail(undefined);
    // The confirmation must use the full saved snapshot, including per-use-case failures.
    void platformApi.getProjectRun(projectId, run.runId, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setDetail(value); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(localizeCaughtFailure(error, t("projectShell.historyUi.detailLoadFailed")));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId, run.runId, attempt, t]);

  const current = detail?.run;
  const targets = current && detail.snapshot ? historyRetryTargets(current, detail.snapshot, t) : [];
  const hasFailure = current && (hasHistoryRetryFailure(current) || (current.status === "completed" && current.terminal !== false &&
    detail.snapshot && "diagramErrors" in detail.snapshot && Object.values(detail.snapshot.diagramErrors).some((failure) => failure.error.retryable)));
  const canConfirm = canStartRuns && !loading && !loadError && hasFailure && targets.length > 0;
  const confirmRetry = async () => {
    if (!canConfirm || submissionPending.current) return;
    submissionPending.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      await platformApi.retryProjectRun(projectId, run.runId);
      onRetried();
    } catch (error) {
      setSubmitError(localizeCaughtFailure(error, t("projectShell.historyUi.retryFailed")));
      submissionPending.current = false;
      setSubmitting(false);
    }
  };

  return <Dialog open onOpenChange={(open) => { if (!open && !submissionPending.current) onClose(); }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t("projectShell.historyUi.retryTitle")}</DialogTitle>
        <DialogDescription>{t("projectShell.historyUi.retryDescription")}</DialogDescription>
      </DialogHeader>
      {loading && <p role="status" className="text-sm text-muted-foreground">{t("projectShell.historyUi.detailLoading")}</p>}
      {loadError && <Alert variant="destructive"><p>{loadError}</p><Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>{t("projectShell.historyUi.reloadDetails")}</Button></Alert>}
      {!loading && !loadError && <section className="grid gap-2 text-sm">
        <h3 className="font-semibold">{t("projectShell.historyUi.retryTargets")}</h3>
        {hasFailure && targets.length > 0
          ? <ul className="max-h-[45vh] list-disc space-y-2 overflow-auto pl-5">{targets.map((target, index) => <li key={index}>{target}</li>)}</ul>
          : <p className="text-muted-foreground">{t("projectShell.historyUi.noRetryTargets")}</p>}
      </section>}
      {submitError && <Alert variant="destructive">{submitError}</Alert>}
      <DialogFooter>
        <Button variant="outline" disabled={submitting} onClick={onClose}>{t("common.cancel")}</Button>
        <Button disabled={!canConfirm || submitting} aria-busy={submitting} onClick={() => void confirmRetry()}>{t("projectShell.historyUi.confirmRetry")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
