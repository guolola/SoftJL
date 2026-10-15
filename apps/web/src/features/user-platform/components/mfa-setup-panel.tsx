// Renders the reusable MFA setup step with authenticator QR, shared secret, and code confirmation.
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, KeyRound, QrCode, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { cn } from "../../../shared/ui/utils";

export interface MfaSetup {
  secret: string;
  otpauthUri: string;
  expiresAt: string;
}

export interface MfaSetupPanelProps {
  setup: MfaSetup;
  code: string;
  onCodeChange: (code: string) => void;
  onConfirm: () => void;
  onCopySecret?: () => void;
  className?: string;
}

function formatDateTime(value: string, locale: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function MfaSetupPanel({
  setup,
  code,
  onCodeChange,
  onConfirm,
  onCopySecret,
  className,
}: MfaSetupPanelProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "zh-CN";
  const id = React.useId();
  const [copyState, setCopyState] = React.useState<"idle" | "copied" | "failed">("idle");
  const expiresAtLabel = React.useMemo(() => formatDateTime(setup.expiresAt, locale), [locale, setup.expiresAt]);
  const canConfirm = code.trim().length > 0;
  const titleId = `${id}-title`;
  const secretId = `${id}-secret`;
  const secretLabelId = `${id}-secret-label`;
  const codeId = `${id}-code`;
  const codeHelpId = `${id}-code-help`;

  const copySecret = React.useCallback(async () => {
    if (onCopySecret) {
      onCopySecret();
      setCopyState("copied");
      return;
    }

    try {
      const clipboard = navigator.clipboard;
      if (!clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await clipboard.writeText(setup.secret);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }, [onCopySecret, setup.secret]);

  React.useEffect(() => {
    if (copyState === "idle") return;

    const timeout = window.setTimeout(() => setCopyState("idle"), 2400);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  return (
    <section
      className={cn("grid gap-4 rounded-md border border-border bg-background p-4 text-sm", className)}
      aria-labelledby={titleId}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md border border-border bg-muted p-2 text-muted-foreground">
          <ShieldCheck className="size-4" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h3 id={titleId} className="text-sm font-semibold text-foreground">
            {t("account.mfaPanel.title")}
          </h3>
          <p className="text-xs leading-5 text-muted-foreground">
            {t("account.mfaPanel.description")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[176px_1fr]">
        <div className="mx-auto grid w-full max-w-44 place-items-center rounded-md border border-border bg-white p-3 sm:mx-0">
          <QRCodeSVG
            value={setup.otpauthUri}
            size={152}
            level="M"
            marginSize={2}
            title={t("account.mfaPanel.qr")}
            role="img"
            aria-label={t("account.mfaPanel.qr")}
          />
        </div>

        <div className="grid min-w-0 gap-3">
          <div className="grid gap-1.5">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <QrCode className="size-4 text-muted-foreground" aria-hidden="true" />
              {t("account.mfaPanel.scan")}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {t("account.mfaPanel.scanDescription", { time: expiresAtLabel })}
            </p>
          </div>

          <div className="grid gap-2">
            <div id={secretLabelId} className="flex items-center gap-2 text-sm font-medium text-foreground">
              <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
              {t("account.mfaPanel.secret")}
            </div>
            <div className="flex min-w-0 gap-2">
              <output
                id={secretId}
                aria-labelledby={secretLabelId}
                className="min-h-9 min-w-0 flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs leading-5 text-foreground break-all"
              >
                {setup.secret}
              </output>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copySecret}
                aria-label={t("account.mfaPanel.copySecret")}
              >
                {copyState === "copied" ? (
                  <Check className="size-4 text-success" aria-hidden="true" />
                ) : (
                  <Copy className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>
            <div className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
              {copyState === "copied" && t("account.mfaPanel.copied")}
              {copyState === "failed" && t("account.mfaPanel.copyFailed")}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={codeId}>{t("account.mfaPanel.code")}</Label>
        <Input
          id={codeId}
          value={code}
          onChange={(event) => onCodeChange(event.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={t("account.mfaPanel.codePlaceholder")}
          aria-describedby={codeHelpId}
        />
        <p id={codeHelpId} className="text-xs leading-5 text-muted-foreground">
          {t("account.mfaPanel.codeHelp")}
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={onConfirm} disabled={!canConfirm}>
          {t("account.mfaPanel.confirm")}
        </Button>
      </div>
    </section>
  );
}
