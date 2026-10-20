// Hosts username-only signup, login, and authenticator verification.
import { useEffect, useState, useRef, type CSSProperties, type PointerEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Boxes, Eye, EyeOff, FileCode2, Loader2, Workflow } from "lucide-react";
import type { AuthRoutePath } from "../../../shared/lib/app-route-types";
import Logo from "../../../shared/template/assets/svg/logo";
import { Button } from "../../../shared/ui/button";
import { Card } from "../../../shared/ui/card";
import { Checkbox } from "../../../shared/ui/checkbox";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../../../shared/ui/input-otp";
import { useFloatingAlert } from "../../../shared/ui/floating-alert";
import { LanguagePreferenceMenu } from "../../../shared/i18n/components/language-preference-menu";
import { localizeCaughtFailure } from "../../../shared/i18n/api-errors";
import { formatDateTime } from "../lib/project-workspace-presentation";
import { getQueryParam, getSafeRedirectPath } from "../lib/auth-page-routing";
import { clearLegacyRememberedLoginPassword, readRememberedLoginIdentifier, writeRememberedLoginIdentifier } from "../lib/remembered-login";
import { notifyAuthSessionChanged, platformApi, type PlatformMfaChallenge } from "../services/platform-api";

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

export function AuthPage({ path, onNavigate }: {
  path: AuthRoutePath;
  onNavigate: (path: string, options?: { fromLogin?: boolean }) => void;
}) {
  const { t, i18n } = useTranslation();
  const rootRef = useRef<HTMLElement>(null);
  const { showAlert } = useFloatingAlert();
  const registering = path === "/register";
  const [username, setUsername] = useState(() => registering ? "" : readRememberedLoginIdentifier());
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(() => Boolean(readRememberedLoginIdentifier()));
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<PlatformMfaChallenge | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const redirect = getSafeRedirectPath();
  const reason = getQueryParam("reason");

  useEffect(() => { clearLegacyRememberedLoginPassword(); }, []);
  useEffect(() => {
    setUsername(registering ? "" : readRememberedLoginIdentifier());
    setPassword(""); setShowPassword(false); setMfaChallenge(null); setMfaCode("");
    setTermsError(""); setTermsAccepted(false);
  }, [path, registering]);
  useEffect(() => {
    if (registering || !reason) return;
    const message = reason === "session-expired" ? "sessionExpiredNotice" : reason === "session-check-failed" ? "sessionCheckFailedNotice" : "loginRequiredNotice";
    showAlert({ id: `auth-login-${reason}`, title: t("auth.page.loginNoticeTitle"), description: t(`auth.page.${message}`), tone: "info" });
  }, [reason, registering, showAlert, t]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (registering && !termsAccepted) { setTermsError(t("auth.page.termsRequired")); return; }
    setSubmitting(true);
    try {
      if (registering) {
        await platformApi.register({ username: username.trim().toLowerCase(), password, displayName: displayName.trim() });
      } else if (mfaChallenge) {
        await platformApi.verifyMfa({ challengeId: mfaChallenge.challengeId, code: mfaCode });
      } else {
        const response = await platformApi.login({ identifier: username.trim().toLowerCase(), password });
        const challenge = response.mfaChallenge ?? (response.mfa?.required && response.mfa.challengeId ? { challengeId: response.mfa.challengeId, expiresAt: response.mfa.expiresAt } : null);
        if (challenge) { setMfaChallenge(challenge); return; }
      }
      if (!registering) writeRememberedLoginIdentifier(username, rememberLogin);
      notifyAuthSessionChanged();
      showAlert({ title: t(registering ? "auth.page.registerSuccess" : "auth.page.loginSuccess"), tone: "success" });
      onNavigate(redirect, { fromLogin: true });
    } catch (error) {
      showAlert({ title: localizeCaughtFailure(error, t("auth.page.requestFailed")), tone: "destructive" });
    } finally { setSubmitting(false); }
  };

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
  return (
    <main ref={rootRef} onPointerMove={handlePointerMove} style={offScreenSpotlight} data-testid="auth-shell" data-auth-layout="admincn-v2" className="relative isolate flex min-h-svh flex-1 flex-col overflow-x-hidden bg-background">
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
      <section data-testid="auth-form-panel" className="relative z-10 flex flex-1 items-center justify-center px-4 pb-14 pt-2 sm:px-6">
        <Card className="w-full max-w-md gap-0 overflow-hidden bg-card/95 p-0 shadow-xl backdrop-blur-2xl lg:grid lg:max-w-4xl lg:grid-cols-2">
          <div className="flex flex-col gap-6 p-6 sm:p-8">
            {(mfaChallenge || registering) && <Button type="button" variant="link" className="h-auto w-fit gap-2 px-0 text-muted-foreground" onClick={() => { setMfaChallenge(null); setMfaCode(""); if (!mfaChallenge) onNavigate("/login"); }}><ArrowLeft className="size-4" />{t("auth.page.backLogin")}</Button>}
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t(mfaChallenge ? "auth.page.mfaCode" : registering ? "auth.page.registerTitle" : "auth.page.loginTitle")}</h1>
              <p className="text-sm leading-6 text-muted-foreground">{t(mfaChallenge ? "auth.page.mfaPrompt" : registering ? "auth.page.registerDescription" : "auth.page.loginDescription")}</p>
            </div>
            <form className="grid gap-6" onSubmit={submit}>
              {!mfaChallenge ? <>
                <div className="grid gap-2">
                  <Label htmlFor="auth-username">{t("auth.page.username")}</Label>
                  <Input id="auth-username" name="username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value.toLowerCase())} pattern="[a-z0-9_]{3,32}" minLength={3} maxLength={32} title={t("auth.page.usernameTitle")} placeholder="teacher_001" required />
                  {registering && <span className="text-xs text-muted-foreground">{t("auth.page.usernameHint")}</span>}
                </div>
                {registering && <div className="grid gap-2"><Label htmlFor="auth-display-name">{t("auth.page.displayName")}</Label><Input id="auth-display-name" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={120} required /></div>}
                <div className="grid gap-2">
                  <Label htmlFor="auth-password">{t("auth.page.password")}</Label>
                  <div className="relative"><Input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={registering ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} minLength={registering ? 8 : 1} maxLength={128} required className="pr-12" /><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-0 size-9" aria-label={t(showPassword ? "auth.page.hidePassword" : "auth.page.showPassword")} onClick={() => setShowPassword(current => !current)}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button></div>
                </div>
                {registering ? <div className="grid gap-1.5"><div className="flex items-center gap-2"><Checkbox id="terms" checked={termsAccepted} onCheckedChange={checked => { setTermsAccepted(checked); setTermsError(""); }} aria-invalid={!!termsError} aria-describedby={termsError ? "terms-error" : undefined} /><Label htmlFor="terms">{t("auth.page.terms")}</Label></div>{termsError && <p id="terms-error" role="alert" className="text-sm text-destructive">{termsError}</p>}</div> : <div className="flex items-center gap-2"><Checkbox id="auth-remember" checked={rememberLogin} onCheckedChange={setRememberLogin} /><Label htmlFor="auth-remember">{t("auth.page.remember")}</Label></div>}
              </> : <div className="grid gap-3"><Label htmlFor="auth-mfa-code">{t("auth.page.mfaCode")}</Label><InputOTP id="auth-mfa-code" maxLength={6} pattern="[0-9]*" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={setMfaCode} required><InputOTPGroup className="w-full min-w-0 justify-center gap-1 sm:gap-4">{[0, 1, 2, 3, 4, 5].map(index => <InputOTPSlot key={index} index={index} className="size-9 rounded-lg border sm:size-10" />)}</InputOTPGroup></InputOTP>{mfaChallenge.expiresAt && <span className="text-xs text-muted-foreground">{t("auth.page.mfaExpiry", { time: formatDateTime(mfaChallenge.expiresAt, i18n.language) })}</span>}</div>}
              <Button type="submit" disabled={submitting} className="w-full">{submitting && <Loader2 className="size-4 animate-spin" />}{t(mfaChallenge ? "auth.page.submitMfa" : registering ? "auth.page.submitRegister" : "auth.page.submitLogin")}</Button>
            </form>
            <p className="text-center text-sm text-muted-foreground">{t(registering ? "auth.page.haveAccount" : "auth.page.noAccount")} <Button type="button" variant="link" className="h-auto p-0" onClick={() => onNavigate(registering ? "/login" : "/register")}>{t(registering ? "auth.page.loginLink" : "auth.page.createAccount")}</Button></p>
          </div>
          <aside className="hidden flex-col justify-between gap-12 border-s bg-muted/40 p-8 lg:flex"><div><p className="text-2xl font-semibold">{t("auth.page.platformName")}</p><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("auth.page.panelDescription")}</p></div><ul className="flex flex-col gap-5">{[{ Icon: Boxes, key: "capabilityModels" }, { Icon: Workflow, key: "capabilityWorkflow" }, { Icon: FileCode2, key: "capabilityArtifacts" }].map(({ Icon, key }) => <li key={key} className="flex items-center gap-3.5"><span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Icon className="size-4" /></span><span className="text-sm">{t(`auth.page.${key}`)}</span></li>)}</ul></aside>
        </Card>
      </section>
    </main>
  );
}
