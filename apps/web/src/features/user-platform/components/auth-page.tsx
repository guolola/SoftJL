// Hosts the public authentication routes and their API-backed submission flows.
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../../../shared/ui/input-otp";
import {
  type CSSProperties,
  FormEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Boxes,
  Eye,
  EyeOff,
  FileCode2,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Workflow,
} from "lucide-react";
import type { AuthRoutePath } from "../../../shared/lib/app-route-types";
import Logo from "../../../shared/template/assets/svg/logo";
import { Button } from "../../../shared/ui/button";
import { Card } from "../../../shared/ui/card";
import { useFloatingAlert } from "../../../shared/ui/floating-alert";
import { Input } from "../../../shared/ui/input";
import { Checkbox } from '../../../shared/ui/checkbox';
import { Label } from "../../../shared/ui/label";
import { LanguagePreferenceMenu } from "../../../shared/i18n/components/language-preference-menu";
import { localizeCaughtFailure } from "../../../shared/i18n/api-errors";
import {
  getQueryParam,
  getSafeRedirectPath,
} from "../lib/auth-page-routing";
import { formatDateTime } from "../lib/project-workspace-presentation";
import {
  clearLegacyRememberedLoginPassword,
  readRememberedLoginIdentifier,
  writeRememberedLoginIdentifier,
} from "../lib/remembered-login";
import {
  notifyAuthSessionChanged,
  platformApi,
  PlatformApiError,
  type PlatformMfaChallenge,
} from "../services/platform-api";

type Navigate = (path: string, options?: { fromLogin?: boolean }) => void;

function WorkbenchThemeImage({
  lightSrc,
  darkSrc,
  className,
}: {
  lightSrc: string;
  darkSrc: string;
  className: string;
}) {
  return (
    <>
      <img src={lightSrc} alt="" className={`${className} dark:hidden`} />
      <img src={darkSrc} alt="" className={`hidden ${className} dark:block`} />
    </>
  );
}

function WorkbenchBackdrop() {
  const tiles = [
    ["/help/images/workbench-kpi.png", "/help/images/workbench-kpi-dark.png"],
    ["/help/images/workbench-timeline.png", "/help/images/workbench-timeline-dark.png"],
    ["/help/images/workbench-weekly.png", "/help/images/workbench-weekly-dark.png"],
    ["/help/images/workbench-conversion.png", "/help/images/workbench-conversion-dark.png"],
    ["/help/images/workbench-performance.png", "/help/images/workbench-performance-dark.png"],
    ["/help/images/workbench-table.png", "/help/images/workbench-table-dark.png"],
  ] as const;

  return (
    <div className="absolute inset-0 overflow-hidden bg-background">
      <div className="absolute -inset-10 grid grid-cols-4 grid-rows-3 gap-4 -rotate-2">
        {[...tiles, ...tiles].map(([lightSrc, darkSrc], index) => (
          <div
            key={`${lightSrc}-${index}`}
            className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
          >
            <WorkbenchThemeImage
              lightSrc={lightSrc}
              darkSrc={darkSrc}
              className="size-full object-cover object-left-top"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AuthPage({
  path,
  onNavigate,
}: {
  path: AuthRoutePath;
  onNavigate: Navigate;
}) {
  const { t, i18n } = useTranslation();
  const { showAlert } = useFloatingAlert();
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "zh-CN";
  const rootRef = useRef<HTMLElement>(null);
  const [email, setEmail] = useState(() =>
    path === "/login" ? readRememberedLoginIdentifier() : getQueryParam("email"),
  );
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [rememberLogin, setRememberLogin] = useState(() =>
    path === "/login" && Boolean(readRememberedLoginIdentifier()),
  );
  const [showPassword, setShowPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<PlatformMfaChallenge | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [invitationToken, setInvitationToken] = useState(() => {
    if (typeof window === "undefined" || path !== "/register") {
      return "";
    }
    const params = new URLSearchParams(window.location.search);
    return (
      params.get("invitationToken") ??
      params.get("invite") ??
      params.get("token") ??
      ""
    );
  });
  const [termsError, setTermsError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const urlToken =
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("token") ?? "";
  const [verificationToken, setVerificationToken] = useState(() => urlToken);
  const queryEmail = getQueryParam("email");
  const authReason = getQueryParam("reason");
  const redirectPath = getSafeRedirectPath();
  const resetTokenMissing = path === "/reset-password" && !urlToken;

  useEffect(() => {
    clearLegacyRememberedLoginPassword();
  }, []);

  useEffect(() => {
    if (path === "/verify-email") {
      setVerificationToken(urlToken);
    }
  }, [path, urlToken]);

  useEffect(() => {
    setShowPassword(false);
    if (path !== "/login") return;
    const rememberedIdentifier = readRememberedLoginIdentifier();
    setRememberLogin(Boolean(rememberedIdentifier));
    setPassword("");
    if (queryEmail) {
      setEmail(queryEmail);
    } else if (rememberedIdentifier) {
      setEmail(rememberedIdentifier);
    }
  }, [path, queryEmail]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setTermsError("");
    try {
      if (path === "/login") {
        if (mfaChallenge) {
          await platformApi.verifyMfa({
            challengeId: mfaChallenge.challengeId,
            code: mfaCode,
          });
          writeRememberedLoginIdentifier(email, rememberLogin);
          notifyAuthSessionChanged();
          showAlert({ title: t("auth.page.mfaSuccess"), tone: "success" });
          onNavigate(redirectPath, { fromLogin: true });
          return;
        }
        const response = await platformApi.login({ identifier: email, password });
        const nextMfaChallenge =
          response.mfaChallenge ??
          (response.mfa?.required && response.mfa.challengeId
            ? {
                challengeId: response.mfa.challengeId,
                expiresAt: response.mfa.expiresAt,
              }
            : null);
        if (nextMfaChallenge) {
          setMfaChallenge(nextMfaChallenge);
          setMfaCode("");
          return;
        }
        writeRememberedLoginIdentifier(email, rememberLogin);
        notifyAuthSessionChanged();
        showAlert({ title: t("auth.page.loginSuccess"), tone: "success" });
        onNavigate(redirectPath, { fromLogin: true });
        return;
      }
      if (path === "/register") {
        if (!termsAccepted) {
          setTermsError(t("auth.page.termsRequired"));
          return;
        }
        const trimmedInvitationToken = invitationToken.trim();
        await platformApi.register({
          email,
          username: username.trim(),
          password,
          displayName: displayName.trim(),
          ...(trimmedInvitationToken
            ? { invitationToken: trimmedInvitationToken }
            : {}),
        });
        showAlert({ title: t("auth.page.registerSuccess"), tone: "success" });
        if (trimmedInvitationToken) {
          await platformApi.acceptInvitation(trimmedInvitationToken);
          onNavigate(`/verify-email?email=${encodeURIComponent(email)}&sent=1`);
          return;
        }
        onNavigate(`/verify-email?email=${encodeURIComponent(email)}&sent=1`);
        return;
      }
      if (path === "/forgot-password") {
        await platformApi.forgotPassword({ email });
        showAlert({
          title: t("auth.page.resetSent", { email: email || t("auth.page.yourEmail") }),
          tone: "success",
        });
        return;
      }
      if (path === "/reset-password") {
        if (!urlToken) return;
        await platformApi.resetPassword({ token: urlToken, newPassword: password });
        showAlert({ title: t("auth.page.resetSuccess"), tone: "success" });
        onNavigate("/login");
        return;
      }
      if (path === "/verify-email") {
        const token = urlToken || verificationToken.trim();
        if (token) {
          await platformApi.verifyEmail({ token });
          const loginEmail = email || queryEmail;
          showAlert({ title: t("auth.page.verifySuccessRedirect"), tone: "success" });
          onNavigate(
            loginEmail ? `/login?email=${encodeURIComponent(loginEmail)}` : "/login",
          );
          return;
        }
        await platformApi.resendVerification({ email: email || queryEmail });
        showAlert({ title: t("auth.page.verifyResentToken"), tone: "success" });
        return;
      }
      if (urlToken) {
        await platformApi.verifyEmail({ token: urlToken });
        showAlert({ title: t("auth.page.verifySuccess"), tone: "success" });
        return;
      }
      await platformApi.resendVerification({ email: email || queryEmail });
      showAlert({ title: t("auth.page.verifyResent"), tone: "success" });
    } catch (error) {
      if (
        path === "/login" &&
        error instanceof PlatformApiError &&
        error.code === "AUTH_EMAIL_VERIFICATION_REQUIRED"
      ) {
        onNavigate(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      showAlert({
        title: localizeCaughtFailure(error, t("auth.page.requestFailed")),
        tone: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const titles: Record<AuthRoutePath, string> = {
    "/login": t("auth.page.loginTitle"),
    "/register": t("auth.page.registerTitle"),
    "/verify-email": t("auth.page.verifyTitle"),
    "/forgot-password": t("auth.page.forgotTitle"),
    "/reset-password": t("auth.page.resetTitle"),
  };
  const descriptions: Record<AuthRoutePath, string> = {
    "/login": t("auth.page.loginDescription"),
    "/register": t("auth.page.registerDescription"),
    "/verify-email": t("auth.page.verifyDescription"),
    "/forgot-password": t("auth.page.forgotDescription"),
    "/reset-password": t("auth.page.resetDescription"),
  };
  const passwordStrength =
    password.length >= 12
      ? t("auth.page.strengthStrong")
      : password.length >= 8
        ? t("auth.page.strengthMedium")
        : t("auth.page.strengthWeak");
  const authPrimaryActionClass = 'w-full';
  const authTextActionClass = 'h-auto p-0 font-medium underline-offset-4 hover:underline';
  const authInputClass = 'w-full';
  const submitLabel =
    path === "/login"
      ? mfaChallenge
        ? t("auth.page.submitMfa")
        : t("auth.page.submitLogin")
      : path === "/register"
        ? t("auth.page.submitRegister")
        : path === "/verify-email"
          ? urlToken || verificationToken.trim()
            ? t("auth.page.submitVerify")
            : t("auth.page.resendVerify")
          : path === "/forgot-password"
            ? t("auth.page.sendReset")
            : t("auth.page.submitReset");
  const loginNotice = path === "/login" && authReason
    ? authReason === "session-expired"
      ? t("auth.page.sessionExpiredNotice")
      : authReason === "session-check-failed"
        ? t("auth.page.sessionCheckFailedNotice")
        : t("auth.page.loginRequiredNotice")
    : "";
  useEffect(() => {
    if (!loginNotice) return;
    showAlert({
      id: `auth-login-${authReason}`,
      title: t("auth.page.loginNoticeTitle"),
      description: loginNotice,
      tone: authReason === "session-check-failed" ? "warning" : "info",
    });
  }, [authReason, loginNotice, showAlert, t]);
  const offScreenSpotlight = {
    "--spot-x": "-100vw",
    "--spot-y": "-100vh",
  } as CSSProperties;
  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    root.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    root.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  };

  // All public authentication states share the compact Login 08 shell while the handlers retain each flow's transitions.
  return (
    <main
      ref={rootRef}
      onPointerMove={handlePointerMove}
      style={offScreenSpotlight}
      data-testid="auth-shell"
      data-auth-layout="admincn-v2"
      className="group/backdrop relative isolate flex min-h-svh flex-1 flex-col overflow-x-hidden bg-background"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-30 scale-105">
        <div className="absolute inset-0 opacity-95 blur-[3px] saturate-[0.55]">
          <WorkbenchBackdrop />
        </div>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-20 bg-muted/55 dark:bg-background/50" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 scale-105 opacity-0 transition-opacity duration-500 group-hover/backdrop:opacity-100 motion-reduce:hidden"
        style={{
          maskImage: "radial-gradient(circle 300px at var(--spot-x) var(--spot-y), black 0%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(circle 300px at var(--spot-x) var(--spot-y), black 0%, transparent 70%)",
        }}
      >
        <WorkbenchBackdrop />
      </div>
      <header className="relative z-20 flex items-center justify-between px-4 py-4 sm:px-8">
        <div className="flex h-10 items-center gap-2 px-2 text-sm font-semibold">
          <Logo className="size-7 object-contain" />
          <span>{t("auth.page.platformName")}</span>
        </div>
        <LanguagePreferenceMenu />
      </header>
      <section
        data-testid="auth-form-panel"
        className="relative z-10 flex flex-1 items-center justify-center px-4 pb-14 pt-2 sm:px-6"
      >
        <Card className="w-full max-w-md gap-0 overflow-hidden bg-card/95 p-0 shadow-xl backdrop-blur-2xl supports-backdrop-filter:bg-card/85 dark:bg-popover/95 dark:supports-backdrop-filter:bg-popover/85 lg:grid lg:max-w-4xl lg:grid-cols-2">
          <div className="flex flex-col gap-6 p-6 sm:p-8">
            {(mfaChallenge || path !== "/login") && <Button
              type="button"
              variant="link"
              className="group h-auto w-fit gap-2 px-0 text-muted-foreground"
              onClick={() => {
                if (mfaChallenge) {
                  setMfaChallenge(null);
                  setMfaCode("");
                  return;
                }
                onNavigate("/login");
              }}
            >
              <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
              {t("auth.page.backLogin")}
            </Button>}
            <div className="flex flex-col gap-6">
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {mfaChallenge ? t("auth.page.mfaCode") : path === "/verify-email" ? t("auth.page.verifyHeading") : titles[path]}
                </h1>
                <p className="text-sm leading-6 text-muted-foreground">
                  {mfaChallenge ? t("auth.page.mfaPrompt") : descriptions[path]}
                </p>
              </div>
            <form className="grid gap-6" onSubmit={submit}>
              {path !== "/reset-password" && !mfaChallenge && (
                <div className="grid gap-2">
                  <Label htmlFor="auth-email" className="text-sm font-medium leading-5 text-foreground">
                    {path === "/login"
                      ? t("auth.page.emailOrUsername")
                      : path === "/forgot-password"
                        ? t("auth.page.email")
                        : t("auth.page.emailAddress")}
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="auth-email"
                      aria-label={path === "/login" ? t("auth.page.emailOrUsername") : t("auth.page.email")}
                      type={path === "/login" ? "text" : "email"}
                      value={email || (path === "/verify-email" ? queryEmail : "")}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setMfaChallenge(null);
                      }}
                      placeholder={path === "/login" ? t("auth.page.emailOrUsername") : "name@example.edu"}
                      required={path !== "/verify-email" || !urlToken}
                      className={`${authInputClass} pl-10`}
                    />
                  </div>
                </div>
              )}
              {!mfaChallenge && (path === "/login" || path === "/register" || path === "/reset-password") && (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="auth-password" className="text-sm font-medium leading-5 text-foreground">
                      {path === "/reset-password" ? t("auth.page.newPassword") : t("auth.page.password")}
                    </Label>
                    {path === "/login" && (
                      <Button variant="link"
                        type="button"
                        className={`${authTextActionClass} text-sm leading-5`}
                        onClick={() => onNavigate("/forgot-password")}
                      >
                        {t("auth.page.forgotPassword")}
                      </Button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="auth-password"
                      aria-label={path === "/reset-password" ? t("auth.page.newPassword") : t("auth.page.password")}
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setMfaChallenge(null);
                      }}
                      placeholder={path === "/register" ? t("auth.page.passwordPlaceholder") : "••••••••"}
                      required
                      className={`${authInputClass} pl-10 pr-12`}
                    />
                    <Button variant="link"
                      type="button"
                      aria-label={showPassword ? t("auth.page.hidePassword") : t("auth.page.showPassword")}
                      title={showPassword ? t("auth.page.hidePassword") : t("auth.page.showPassword")}
                      className="absolute right-3 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center"
                      onClick={() => setShowPassword((current) => !current)}
                    >
                      {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                    </Button>
                  </div>
                  {path !== "/login" && (
                    <div className="grid gap-2">
                      {path === "/register" && (
                        <div className="grid grid-cols-3 gap-1">
                          <span className="h-1.5 rounded-full bg-primary" />
                          <span className="h-1.5 rounded-full bg-border" />
                          <span className="h-1.5 rounded-full bg-border" />
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {t("auth.page.strength", { value: passwordStrength })}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {path === "/login" && !mfaChallenge && (
                <div className="flex items-center">
                  <Checkbox
                    id="auth-remember"
                    checked={rememberLogin}
                    onCheckedChange={setRememberLogin}
                  />
                  <Label htmlFor="auth-remember" className="ml-2 text-sm leading-5 text-muted-foreground">
                    {t("auth.page.remember")}
                  </Label>
                </div>
              )}
              {path === "/login" && mfaChallenge && (
                <div className="grid gap-4" data-auth-layout="collectui-two-factor">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <Label htmlFor="auth-mfa-code" className="text-base">{t("auth.page.mfaCode")}</Label>
                    <Button type="button" variant="link" className="h-auto p-0 text-base" onClick={() => { setUseRecoveryCode(!useRecoveryCode); setMfaCode(''); }}>
                      {t(useRecoveryCode ? 'auth.page.useAuthenticator' : 'auth.page.useRecoveryCode')}
                    </Button>
                  </div>
                  {useRecoveryCode ? <Input id="auth-mfa-code" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} required className={authInputClass} /> :
                  <InputOTP id="auth-mfa-code" maxLength={6} pattern="[0-9]*" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={setMfaCode} required>
                    <InputOTPGroup className="w-full min-w-0 justify-center gap-1 *:data-[slot=input-otp-slot]:rounded-lg *:data-[slot=input-otp-slot]:border sm:gap-4">
                      {[0,1,2,3,4,5].map(index => <InputOTPSlot key={index} index={index} className="size-9 sm:size-10" />)}
                    </InputOTPGroup>
                  </InputOTP>}
                  <span className="text-xs text-muted-foreground">
                    {mfaChallenge.expiresAt
                      ? ` ${t("auth.page.mfaExpiry", { time: formatDateTime(mfaChallenge.expiresAt, locale) })}`
                      : ""}
                  </span>
                </div>
              )}
              {path === "/register" && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="auth-username" className="text-sm font-medium leading-5 text-foreground">
                      {t("auth.page.username")}
                    </Label>
                    <Input
                      id="auth-username"
                      aria-label={t("auth.page.username")}
                      value={username}
                      onChange={(event) => setUsername(event.target.value.toLowerCase())}
                      pattern="[a-z0-9_]{3,32}"
                      title={t("auth.page.usernameTitle")}
                      placeholder="teacher_001"
                      required
                      className={authInputClass}
                    />
                    <span className="text-xs leading-5 text-muted-foreground">
                      {t("auth.page.usernameHint")}
                    </span>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="auth-display-name" className="text-sm font-medium leading-5 text-foreground">
                      {t("auth.page.displayName")}
                    </Label>
                    <Input
                      id="auth-display-name"
                      aria-label={t("auth.page.displayName")}
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder={t("auth.page.displayNamePlaceholder")}
                      required
                      className={authInputClass}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="invite-code" className="text-sm font-medium leading-5 text-foreground">
                      {t("auth.page.invitation")} <span className="font-normal text-muted-foreground">{t("auth.page.optional")}</span>
                    </Label>
                    <Input
                      id="invite-code"
                      aria-label={t("auth.page.invitation")}
                      value={invitationToken}
                      onChange={(event) => setInvitationToken(event.target.value)}
                      placeholder={t("auth.page.invitationPlaceholder")}
                      className={authInputClass}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="terms"
                        checked={termsAccepted}
                        aria-invalid={Boolean(termsError)}
                        aria-describedby={termsError ? "terms-error" : undefined}
                        onCheckedChange={(checked) => {
                          setTermsAccepted(checked);
                          if (checked) setTermsError("");
                        }}
                        className="size-4 accent-primary"
                      />
                      <Label htmlFor="terms" className="text-sm text-muted-foreground">
                        {t("auth.page.terms")}
                      </Label>
                    </div>
                    {termsError && (
                      <p id="terms-error" role="alert" className="text-xs text-destructive">
                        {termsError}
                      </p>
                    )}
                  </div>
                </>
              )}
              {path === "/verify-email" && (
                <>
                  <div className="rounded-lg border border-border bg-muted p-4 text-sm leading-6 text-muted-foreground">
                    {getQueryParam("sent")
                      ? t("auth.page.verifySent", { email: queryEmail || t("auth.page.yourEmail") })
                      : t("auth.page.verifyInstruction")}
                  </div>
                  {!urlToken && (
                    <div className="grid gap-2">
                      <Label htmlFor="auth-verification-token" className="text-sm font-medium leading-5 text-foreground">
                        {t("auth.page.emailToken")}
                      </Label>
                      <div className="relative">
                        <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="auth-verification-token"
                          aria-label={t("auth.page.emailToken")}
                          value={verificationToken}
                          onChange={(event) => setVerificationToken(event.target.value)}
                          placeholder={t("auth.page.tokenPlaceholder")}
                          className={`${authInputClass} pl-10`}
                        />
                      </div>
                      <span className="text-xs leading-5 text-muted-foreground">
                        {t("auth.page.tokenHint")}
                      </span>
                    </div>
                  )}
                </>
              )}
              {resetTokenMissing && (
                <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {t("auth.page.resetTokenMissing")}
                </div>
              )}
              <Button type="submit" disabled={submitting || resetTokenMissing} className={authPrimaryActionClass}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                {submitLabel}
              </Button>
              {path === "/login" && (
                <p className="text-center text-sm leading-5 text-muted-foreground">
                  {t("auth.page.noAccount")} {" "}
                  <Button variant="link" type="button" className={authTextActionClass} onClick={() => onNavigate("/register")}>
                    {t("auth.page.createAccount")}
                  </Button>
                </p>
              )}
              {path === "/register" && (
                <p className="text-center text-sm leading-5 text-muted-foreground">
                  {t("auth.page.haveAccount")} {" "}
                  <Button variant="link" type="button" className={authTextActionClass} onClick={() => onNavigate("/login")}>
                    {t("auth.page.loginLink")}
                  </Button>
                </p>
              )}
              {path !== "/login" && path !== "/register" && (
                <Button type="button" variant="ghost" className="w-fit px-0" onClick={() => onNavigate("/login")}>
                  {t("auth.page.backLogin")}
                </Button>
              )}
            </form>
            </div>
          </div>
          <aside className="hidden flex-col justify-center gap-8 rounded-r-2xl border-s bg-muted/40 p-8 lg:flex">
            <div>
              <p className="text-2xl font-semibold tracking-tight">{t("auth.page.platformName")}</p>
              <p className="mt-3 text-balance text-sm leading-relaxed text-muted-foreground">
                {t("auth.page.panelDescription")}
              </p>
            </div>
            <ul className="flex flex-col gap-5">
              {[
                { Icon: Boxes, label: t("auth.page.capabilityModels") },
                { Icon: Workflow, label: t("auth.page.capabilityWorkflow") },
                { Icon: FileCode2, label: t("auth.page.capabilityArtifacts") },
              ].map(({ Icon, label }) => (
                <li key={label} className="flex items-center gap-3.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="text-sm leading-relaxed">{label}</span>
                </li>
              ))}
            </ul>
          </aside>
        </Card>
      </section>
    </main>
  );
}
