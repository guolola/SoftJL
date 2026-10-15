// Owns account profile and security pages backed by the account platform APIs.
import { Card } from "../../../shared/ui/card";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { Switch } from "../../../shared/ui/switch";
import { useFloatingAlert } from "../../../shared/ui/floating-alert";
import { localizeCaughtFailure } from "../../../shared/i18n/api-errors";
import { formatSessionRegion } from "../lib/session-device";
import { formatDateTime } from "../lib/project-workspace-presentation";
import {
  platformApi,
  type PlatformAccountSession,
  type PlatformLoginEvent,
  type PlatformMfaSetup,
} from "../services/platform-api";

type Navigate = (path: string) => void;

const ACCOUNT_PAGE_SCROLL_CLASS =
  "min-h-0 min-w-0 w-full overflow-x-clip bg-background";
function avatarUrlValidationMessage(value: string, errorMessage: string) {
  const normalized = value.trim();
  if (!normalized) return "";
  try {
    return new URL(normalized).protocol === "https:" ? "" : errorMessage;
  } catch {
    return errorMessage;
  }
}

function AccountPageFrame({
  children,
  onNavigate,
}: {
  children: ReactNode;
  onNavigate?: Navigate;
}) {
  void onNavigate;
  return (
    <main className={ACCOUNT_PAGE_SCROLL_CLASS}>
      <div className="mx-auto flex w-full max-w-360 flex-col gap-6 px-4 py-6 sm:px-6">
        {children}
      </div>
    </main>
  );
}

function AccountSection({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card as="section" className={`rounded-md border border-border bg-card p-5 ${className}`}>
      {children}
    </Card>
  );
}

export function AccountPage({ onNavigate }: { onNavigate: Navigate }) {
  const { t } = useTranslation();
  const { showAlert } = useFloatingAlert();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [mfaLabel, setMfaLabel] = useState(() => t("account.notLoaded"));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const avatarUrlError = avatarUrlValidationMessage(avatarUrl, t("account.avatarHttps"));

  useEffect(() => {
    let active = true;
    setLoading(true);
    platformApi
      .getAccountProfile()
      .then((response) => {
        if (!active) return;
        setDisplayName(response.user.displayName);
        setEmail(response.user.email);
        setAvatarUrl(response.user.avatarUrl ?? "");
        setMfaLabel(response.mfa?.enabled ? t("account.enabledState") : t("account.disabledState"));
      })
      .catch((profileError) => {
        if (!active) return;
        setLoadError(localizeCaughtFailure(profileError, t("account.profileLoadFailed")));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const saveProfile = async () => {
    if (avatarUrlError) return;
    setSaving(true);
    try {
      const response = await platformApi.updateAccountProfile({
        displayName: displayName.trim(),
        avatarUrl: avatarUrl.trim() || null,
      });
      setDisplayName(response.user.displayName);
      setAvatarUrl(response.user.avatarUrl ?? "");
      setMfaLabel(response.mfa?.enabled ? t("account.enabledState") : t("account.disabledState"));
      showAlert({ title: t("account.profileSavedMessage"), tone: "success" });
    } catch (profileError) {
      showAlert({
        title: localizeCaughtFailure(profileError, t("account.profileSaveFailedMessage")),
        tone: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccountPageFrame onNavigate={onNavigate}>
      <div>
        <h1>{t("account.pageTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("account.pageDescription")}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <AccountSection>
          {loading && <div className="mb-4 text-sm text-muted-foreground">{t("account.profileLoading")}</div>}
          {loadError && (
            <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {loadError}
            </div>
          )}
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="profile-name">{t("account.displayName")}</Label>
              <Input
                id="profile-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-email">{t("account.email")}</Label>
              <Input id="profile-email" type="email" value={email} readOnly />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-avatar">{t("account.avatarUrl")}</Label>
              <Input
                id="profile-avatar"
                type="url"
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://example.com/avatar.png"
                aria-invalid={Boolean(avatarUrlError)}
                aria-describedby={avatarUrlError ? "profile-avatar-error" : undefined}
              />
              {avatarUrlError && (
                <p id="profile-avatar-error" className="text-sm text-destructive" role="alert">
                  {avatarUrlError}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base">{t("account.notifications")}</h2>
                <p className="text-sm text-muted-foreground">{t("account.notificationDescription")}</p>
              </div>
              <Switch defaultChecked aria-label={t("account.notificationsAria")} />
            </div>
            <Button
              type="button"
              onClick={() => void saveProfile()}
              disabled={saving || loading || Boolean(avatarUrlError)}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {t("account.saveProfile")}
            </Button>
          </div>
        </AccountSection>
        <AccountSection>
          <h2 className="text-base">{t("account.basicPreferences")}</h2>
          <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
            <span>{t("account.textSizeDefault")}</span>
            <span>{t("account.themeCurrent")}</span>
            <span>{t("account.avatarState", { state: avatarUrl ? t("account.configured") : t("account.notConfigured") })}</span>
            <span>{t("account.mfaState", { state: mfaLabel })}</span>
          </div>
          <Button type="button" className="mt-4" variant="outline" onClick={() => onNavigate("/account/security")}>
            {t("account.security")}
          </Button>
        </AccountSection>
      </div>
    </AccountPageFrame>
  );
}

export function AccountSecurityPage({ onNavigate }: { onNavigate: Navigate }) {
  const { t, i18n } = useTranslation();
  const { showAlert } = useFloatingAlert();
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "zh-CN";
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<PlatformMfaSetup | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaDisableCode, setMfaDisableCode] = useState("");
  const [sessions, setSessions] = useState<PlatformAccountSession[]>([]);
  const [loginEvents, setLoginEvents] = useState<PlatformLoginEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      platformApi.me(),
      platformApi.listAccountSessions(),
      platformApi.listLoginEvents(),
    ])
      .then(([me, sessionResponse, eventResponse]) => {
        if (!active) {
          return;
        }
        setMfaEnabled(me.mfa?.enabled ?? me.user.mfaEnabled);
        setSessions(sessionResponse.sessions);
        setLoginEvents(eventResponse.events);
        setLoadError("");
      })
      .catch((loadError) => {
        if (!active) {
          return;
        }
        setLoadError(localizeCaughtFailure(loadError, t("account.securityLoadFailed")));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [t]);

  const startMfaSetup = async () => {
    setMfaSubmitting(true);
    try {
      const setup = await platformApi.setupMfa();
      setMfaSetup(setup);
      setMfaCode("");
      showAlert({ title: t("account.mfaSecretReady"), tone: "success" });
    } catch (setupError) {
      showAlert({ title: localizeCaughtFailure(setupError, t("account.mfaSetupError")), tone: "destructive" });
    } finally {
      setMfaSubmitting(false);
    }
  };

  const confirmMfa = async () => {
    setMfaSubmitting(true);
    try {
      const response = await platformApi.confirmMfa({ code: mfaCode });
      setMfaEnabled(response.mfa.enabled);
      setMfaSetup(null);
      setMfaCode("");
      showAlert({ title: t("account.mfaEnabledSuccess"), tone: "success" });
    } catch (confirmError) {
      showAlert({ title: localizeCaughtFailure(confirmError, t("account.mfaVerifyError")), tone: "destructive" });
    } finally {
      setMfaSubmitting(false);
    }
  };

  const disableMfa = async () => {
    setMfaSubmitting(true);
    try {
      const code = mfaDisableCode.trim();
      const response = await platformApi.updateMfa({
        enabled: false,
        ...(code ? { code } : {}),
      });
      setMfaEnabled(response.mfa.enabled);
      setMfaDisableCode("");
      setMfaSetup(null);
      showAlert({ title: t("account.mfaDisabledSuccess"), tone: "success" });
    } catch (disableError) {
      showAlert({ title: localizeCaughtFailure(disableError, t("account.mfaDisableError")), tone: "destructive" });
    } finally {
      setMfaSubmitting(false);
    }
  };

  const revokeOtherSessions = async () => {
    try {
      const response = await platformApi.revokeOtherSessions();
      showAlert({ title: t("account.revokedMessage", { count: response.revokedCount }), tone: "success" });
      const refreshed = await platformApi.listAccountSessions();
      setSessions(refreshed.sessions);
    } catch (revokeError) {
      showAlert({ title: localizeCaughtFailure(revokeError, t("account.revokeSessionError")), tone: "destructive" });
    }
  };

  return (
    <AccountPageFrame onNavigate={onNavigate}>
      <div>
        <h1>{t("account.security")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("account.securityPageDescription")}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <AccountSection>
          <div className="flex items-center gap-2">
            <Lock className="size-4 text-primary" />
            <h2 className="text-base">{t("account.changePassword")}</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t("account.passwordInvalidates")}</p>
          <Button type="button" className="mt-4" variant="outline">{t("account.changePassword")}</Button>
        </AccountSection>
        <AccountSection>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-warning" />
            <h2 className="text-base">MFA {mfaEnabled ? t("account.enabledState") : t("account.disabledState")}</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("account.mfaRecommendation")}
          </p>
          {!mfaEnabled && (
            <div className="mt-4 grid gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={startMfaSetup}
                disabled={mfaSubmitting}
              >
                {mfaSubmitting && <Loader2 className="size-4 animate-spin" />}
                {mfaSetup ? t("account.regenerateMfa") : t("account.enableMfa")}
              </Button>
              {mfaSetup && (
                <div className="grid gap-3 rounded-md border border-border bg-muted p-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">TOTP Secret</div>
                    <div className="mt-1 break-all font-mono text-xs">{mfaSetup.secret}</div>
                  </div>
                  <div className="break-all text-xs text-muted-foreground">
                    {mfaSetup.otpauthUri}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("account.expiresAt", { time: formatDateTime(mfaSetup.expiresAt, locale) })}
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="account-mfa-code">{t("auth.page.mfaCode")}</Label>
                    <Input
                      id="account-mfa-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={mfaCode}
                      onChange={(event) => setMfaCode(event.target.value)}
                      placeholder={t("auth.page.mfaPlaceholder")}
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={confirmMfa}
                    disabled={mfaSubmitting || !mfaCode.trim()}
                  >
                    {t("account.confirmMfa")}
                  </Button>
                </div>
              )}
            </div>
          )}
          {mfaEnabled && (
            <div className="mt-4 grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="account-mfa-disable-code">{t("account.optionalDisableCode")}</Label>
                <Input
                  id="account-mfa-disable-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={mfaDisableCode}
                  onChange={(event) => setMfaDisableCode(event.target.value)}
                  placeholder={t("account.optionalCodePlaceholder")}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={disableMfa}
                disabled={mfaSubmitting}
              >
                {mfaSubmitting && <Loader2 className="size-4 animate-spin" />}
                {t("account.disableMfa")}
              </Button>
            </div>
          )}
        </AccountSection>
        <AccountSection>
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-primary" />
            <h2 className="text-base">{t("account.unusualLogin")}</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t("account.unusualLoginDescription")}</p>
          <Switch defaultChecked aria-label={t("account.unusualLoginAria")} className="mt-4" />
        </AccountSection>
      </div>
      {loadError && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {loadError}
        </div>
      )}
      <AccountSection>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base">{t("account.activeSessions")}</h2>
          <Button type="button" variant="outline" onClick={revokeOtherSessions}>
            {t("account.otherDevices")}
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {loading && <div className="text-sm text-muted-foreground">{t("account.sessionLoading")}</div>}
          {!loading &&
            sessions.map((session) => (
              <div key={session.id} className="rounded-md border border-border p-4 text-sm">
                <div>{session.userAgent ?? t("account.unknownDevice")} · {formatSessionRegion(session, t("account.unknownRegion"))}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t("account.recentActivity", { time: formatDateTime(session.lastSeenAt, locale) })}
                </div>
              </div>
            ))}
          {!loading && sessions.length === 0 && (
            <div className="text-sm text-muted-foreground">{t("account.noSessions")}</div>
          )}
        </div>
      </AccountSection>
      <AccountSection>
        <h2 className="text-base">{t("account.recentLogins")}</h2>
        <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
          {loading && <span>{t("account.loginLoading")}</span>}
          {!loading &&
            loginEvents.map((event) => (
              <span key={event.id}>
                {event.email ?? t("account.unknownAccount")} · {event.outcome === "success" ? t("account.success") : t("account.failed")} ·{" "}
                {formatSessionRegion(event, t("account.unknownRegion"))} · {formatDateTime(event.createdAt, locale)}
              </span>
            ))}
          {!loading && loginEvents.length === 0 && <span>{t("account.noLoginEvents")}</span>}
        </div>
      </AccountSection>
    </AccountPageFrame>
  );
}
