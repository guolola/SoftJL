// Collects document prerequisites and library errors behind one page-header entry.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared/ui/button";
import { FeedbackDialog, type FeedbackDialogState } from "../../../shared/ui/feedback-dialog";
import { PageNoticeButton } from "../../../shared/ui/page-notice-button";

export function DocumentGuidanceDialog({ notices }: { notices: FeedbackDialogState[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (notices.length === 0) return null;

  const label = t("feedback.needsAttentionCount", { count: notices.length });
  const tone = notices.some((notice) => notice.tone === "destructive") ? "destructive" : "warning";
  return (
    <>
      <PageNoticeButton
        label={label}
        tone={tone}
        onClick={() => setOpen(true)}
      />
      <FeedbackDialog
        open={open}
        onClose={() => setOpen(false)}
        feedback={{
          dedupeKey: "document-guidance-overview",
          tone,
          title: label,
          message: t("documentsPage.guidance.overviewDescription"),
        }}
      >
        <ul className="divide-y divide-border">
          {notices.map((notice) => (
            <li key={notice.dedupeKey} className="space-y-2 py-4 first:pt-0 last:pb-0">
              <h3 className="text-sm font-medium text-foreground">{notice.title}</h3>
              <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{notice.message}</p>
              {notice.primaryAction ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Close the overview before navigation or a retry opens new feedback.
                    setOpen(false);
                    void notice.primaryAction!.onSelect();
                  }}
                >
                  {notice.primaryAction.label}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </FeedbackDialog>
    </>
  );
}
