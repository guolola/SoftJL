// Provides the application-wide actionable feedback dialog, queue, and deduplication contract.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./button";
import { PageNoticeButton } from "./page-notice-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { cn } from "./utils";

export type FeedbackTone = "success" | "warning" | "destructive";

export interface FeedbackDialogAction {
  label: string;
  onSelect: () => void | Promise<void>;
  closeOnSelect?: boolean;
}

export interface FeedbackDialogState {
  dedupeKey: string;
  revision?: string | number | null;
  tone: FeedbackTone;
  title: string;
  message: string;
  primaryAction?: FeedbackDialogAction;
  secondaryAction?: FeedbackDialogAction;
  dismissLabel?: string;
  keepReopenEntry?: boolean;
}

interface FeedbackDialogContextValue {
  closeFeedback: () => void;
  openFeedback: (feedback: FeedbackDialogState) => void;
  openFeedbackOnce: (feedback: FeedbackDialogState) => void;
}

const FeedbackDialogContext = createContext<FeedbackDialogContextValue | null>(
  null,
);

function feedbackSignature(feedback: FeedbackDialogState) {
  return `${feedback.dedupeKey}:${String(feedback.revision ?? "default")}`;
}

// Feedback may originate from Markdown-oriented APIs; dialogs always render plain user copy.
export function normalizeFeedbackText(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_, code: string) => {
      const point = Number.parseInt(code, 16);
      return Number.isSafeInteger(point) && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : "";
    })
    .replace(/&#(\d+);/gu, (_, code: string) => {
      const point = Number.parseInt(code, 10);
      return Number.isSafeInteger(point) && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : "";
    })
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .trim();
}

function currentFeedbackScope() {
  if (typeof window === "undefined") return "server";
  return /^\/projects\/([^/]+)/u.exec(window.location.pathname)?.[1] ?? "global";
}

export function FeedbackDialog({
  feedback,
  open,
  onClose,
  children,
}: {
  feedback: FeedbackDialogState | null;
  open: boolean;
  onClose: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  if (!feedback) return null;

  const isFailure = feedback.tone === "destructive";
  const isWarning = feedback.tone === "warning";
  const Icon = isFailure ? XCircle : isWarning ? AlertTriangle : CheckCircle2;
  const iconLabel = t(`feedback.tones.${feedback.tone}`);
  const iconClass = isFailure
    ? "bg-destructive/10 text-destructive"
    : isWarning
      ? "bg-warning/10 text-warning"
      : "bg-success/10 text-success";
  const ringClass = isFailure
    ? "border-destructive/20"
    : isWarning
      ? "border-warning/25"
      : "border-success/20";
  const title = normalizeFeedbackText(feedback.title);
  const message = normalizeFeedbackText(feedback.message);

  const runAction = (action: FeedbackDialogAction) => {
    if (action.closeOnSelect !== false) onClose();
    void action.onSelect();
  };

  

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        data-testid="feedback-dialog"
        className={cn(
          "max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-[12px] border-border/60 bg-card p-[33px] text-center shadow-lg sm:max-w-[448px] [&_[data-slot=dialog-close]]:hidden",
          children && "flex max-h-[85vh] flex-col",
        )}
      >
        <DialogHeader className="shrink-0 items-center gap-0 space-y-0 text-center sm:text-center">
          <div className="mb-6 h-[80px] w-[80px]">
            <div
              aria-label={iconLabel}
              data-feedback-tone={feedback.tone}
              className={cn(
                "relative flex size-[80px] items-center justify-center rounded-full",
                iconClass,
              )}
            >
              <Icon className="size-10" strokeWidth={3} />
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-0 rounded-full border opacity-30",
                  ringClass,
                )}
              />
            </div>
          </div>
          <DialogTitle className="text-center text-[20px] font-semibold leading-[28px] text-foreground">
            {title}
          </DialogTitle>
          <DialogDescription className="mx-auto mt-2 max-w-[320px] whitespace-pre-line text-center text-[14px] leading-5 text-muted-foreground">
            {message}
          </DialogDescription>
        </DialogHeader>
        {children ? (
          // Detailed guidance scrolls independently so the shared summary and actions stay visible.
          <div data-slot="feedback-details" className="mt-6 min-h-0 overflow-y-auto text-left">
            {children}
          </div>
        ) : null}
        <DialogFooter className="mt-6 shrink-0 flex-row flex-wrap justify-center gap-3 sm:justify-center">
          {feedback.secondaryAction ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-[8px] px-5 text-[14px] font-normal"
              onClick={() => runAction(feedback.secondaryAction!)}
            >
              {feedback.secondaryAction.label}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={feedback.primaryAction ? "ghost" : "default"}
            className="h-10 rounded-[8px] px-5 text-[14px] font-normal"
            onClick={onClose}
          >
            {feedback.dismissLabel ?? t("feedback.dismiss")}
          </Button>
          {feedback.primaryAction ? (
            <Button
              type="button"
              autoFocus
              className="h-10 rounded-[8px] px-5 text-[14px] font-normal shadow-sm"
              onClick={() => runAction(feedback.primaryAction!)}
            >
              {feedback.primaryAction.label}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FeedbackDialogProvider({ children }: { children: ReactNode }) {
  const [activeFeedback, setActiveFeedback] =
    useState<FeedbackDialogState | null>(null);
  const queuedFeedbackRef = useRef<FeedbackDialogState[]>([]);
  const scheduledSignaturesRef = useRef(new Set<string>());
  const scopeRef = useRef(currentFeedbackScope());

  useEffect(() => {
    const resetForProjectChange = () => {
      const nextScope = currentFeedbackScope();
      if (nextScope === scopeRef.current) return;
      scopeRef.current = nextScope;
      scheduledSignaturesRef.current.clear();
      queuedFeedbackRef.current = [];
      setActiveFeedback(null);
    };

    window.addEventListener("popstate", resetForProjectChange);
    window.addEventListener("uml-route-change", resetForProjectChange);
    return () => {
      window.removeEventListener("popstate", resetForProjectChange);
      window.removeEventListener("uml-route-change", resetForProjectChange);
    };
  }, []);

  const openFeedback = useCallback<FeedbackDialogContextValue["openFeedback"]>(
    (feedback) => {
      setActiveFeedback((current) => {
        if (!current) return feedback;
        queuedFeedbackRef.current.push(feedback);
        return current;
      });
    },
    [],
  );

  const openFeedbackOnce = useCallback<
    FeedbackDialogContextValue["openFeedbackOnce"]
  >(
    (feedback) => {
      const signature = feedbackSignature(feedback);
      if (scheduledSignaturesRef.current.has(signature)) return;
      scheduledSignaturesRef.current.add(signature);
      openFeedback(feedback);
    },
    [openFeedback],
  );

  const closeFeedback = useCallback(() => {
    setActiveFeedback(queuedFeedbackRef.current.shift() ?? null);
  }, []);

  const value = useMemo(
    () => ({ closeFeedback, openFeedback, openFeedbackOnce }),
    [closeFeedback, openFeedback, openFeedbackOnce],
  );

  return (
    <FeedbackDialogContext.Provider value={value}>
      {children}
      <FeedbackDialog
        feedback={activeFeedback}
        open={Boolean(activeFeedback)}
        onClose={closeFeedback}
      />
    </FeedbackDialogContext.Provider>
  );
}

export function useFeedbackDialog() {
  const value = useContext(FeedbackDialogContext);
  if (!value) {
    throw new Error(
      "useFeedbackDialog must be used within FeedbackDialogProvider",
    );
  }
  return value;
}

export function FeedbackReopenButton({
  feedback,
  label,
}: {
  feedback: FeedbackDialogState;
  label?: string;
}) {
  const { t } = useTranslation();
  const { openFeedback } = useFeedbackDialog();
  return (
    <PageNoticeButton
      label={label ?? t("feedback.needsAttention")}
      tone={feedback.tone === "destructive" ? "destructive" : "warning"}
      onClick={() => openFeedback(feedback)}
    />
  );
}
