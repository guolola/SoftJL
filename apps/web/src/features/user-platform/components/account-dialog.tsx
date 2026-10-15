// Hosts the top-bar account modal for profile, MFA, sessions, and login-state actions.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Palette,
  LayoutDashboard,
  Languages,
  Camera,
  KeyRound,
  Laptop,
  Loader2,
  LogIn,
  LogOut,
  Monitor,
  Settings,
  Shield,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { GlobalSettingsPanel, type GlobalSettingsActions } from "../../settings/components/global-settings-panel";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { localizeCaughtFailure } from "../../../shared/i18n/api-errors";
import { Avatar, AvatarFallback } from "../../../shared/ui/avatar";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../shared/ui/dialog";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui/tabs";
import { cn } from "../../../shared/ui/utils";
import { formatSessionDevice, formatSessionRegion } from "../lib/session-device";
import {
  ACCOUNT_SESSION_RECORD_LIMIT,
  AVATAR_FILE_TYPES,
  MAX_AVATAR_BYTES,
  accountStatusLabel,
  formatDate,
  initials,
} from "../lib/account-dialog-formatting";
import {
  platformApi,
  PlatformApiError,
  type PlatformAccountSession,
  type PlatformMfaSetup,
  type PlatformUser,
} from "../services/platform-api";
import { AccountAvatarPreview } from "./account-avatar-preview";
import { MfaSetupPanel } from "./mfa-setup-panel";

import { AccountPreferencePages } from '../../settings/components/account-preference-pages';
import { Block37Preview, SettingRow } from '../../settings/components/block37-preferences';
import { useAccountPreferences } from '../../settings/lib/use-account-preferences';

type AccountDialogProps = {
  showTrigger?: boolean;
  onNavigate: (route: string) => void;
  initialUser?: PlatformUser | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  globalSettingsRequestId?: number;
};

export function AccountDialog({
  showTrigger = true,
  onNavigate,
  initialUser = null,
  open: controlledOpen,
  onOpenChange,
  globalSettingsRequestId,
}: AccountDialogProps) {
  const { t, i18n } = useTranslation();
  const translationRef = useRef(t);
  translationRef.current = t;
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "zh-CN";
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setDialogOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );
  const preferences = useAccountPreferences(open);
  const modelActions = useRef<GlobalSettingsActions>(null);
  const [modelDirty, setModelDirty] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const profileSaveInFlight = useRef(false);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<PlatformUser | null>(initialUser);
  const [displayName, setDisplayName] = useState(initialUser?.displayName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialUser?.avatarUrl ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<PlatformMfaSetup | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [sessions, setSessions] = useState<PlatformAccountSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState("theme");
  // A new connection-error request should focus this tab even if the dialog stayed open.
  useEffect(() => {
    if (globalSettingsRequestId) setActiveTab("global");
  }, [globalSettingsRequestId]);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const openLocationRef = useRef<string | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!initialUser) return;
    setUser(initialUser);
    setDisplayName(initialUser.displayName);
    setAvatarUrl(initialUser.avatarUrl ?? "");
  }, [initialUser]);

  useEffect(() => {
    let active = true;
    if (initialUser) {
      return () => {
        active = false;
      };
    }
    platformApi
      .me()
      .then((response) => {
        if (!active) return;
        setUser(response.user ?? null);
        setDisplayName(response.user?.displayName ?? "");
        setAvatarUrl(response.user?.avatarUrl ?? "");
        setCurrentSessionId(response.session?.id ?? null);
      })
      .catch(() => {
        if (active) setUser(null);
      });
    return () => {
      active = false;
    };
  }, [initialUser]);

  useEffect(() => {
    if (!open || !userId) return;
    let active = true;
    setLoading(true);
    setStatus("");
    Promise.all([
      platformApi.getAccountProfile(),
      platformApi.listAccountSessions(),
    ])
      .then(([profile, sessionResponse]) => {
        if (!active) return;
        setUser(profile.user);
        setDisplayName(profile.user.displayName);
        setAvatarUrl(profile.user.avatarUrl ?? "");
        setAvatarFile(null);
        setAvatarError("");
        setMfaEnabled(Boolean(profile.mfa?.enabled ?? profile.user.mfaEnabled));
        setCurrentSessionId(profile.session?.id ?? null);
        setSessions(sessionResponse.sessions);
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof PlatformApiError && error.status === 401) {
          setUser(null);
          return;
        }
        setStatus(localizeCaughtFailure(error, translationRef.current("account.loadFailed")));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, userId]);

  const title = useMemo(() => user?.displayName || user?.email || t("auth.login"), [t, user]);
  const avatarPreviewSrc = avatarPreviewUrl || avatarUrl;
  const accountStatus = accountStatusLabel(user?.status, {
    active: t("account.normal"),
    disabled: t("account.disabled"),
    pending: t("account.pending"),
    unknown: t("account.unknown"),
  });
  const visibleSessions = sessions.slice(0, ACCOUNT_SESSION_RECORD_LIMIT);

  useEffect(() => {
    openLocationRef.current = open
      ? `${window.location.pathname}${window.location.search}`
      : null;
  }, [open]);

  useEffect(() => {
    const closeIfLocationChanged = () => {
      const openedAt = openLocationRef.current;
      if (!openedAt) return;
      const currentLocation = `${window.location.pathname}${window.location.search}`;
      if (currentLocation !== openedAt) {
        setDialogOpen(false);
      }
    };
    const closeForRouteChange = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (!detail || typeof detail.path !== "string") return;
      closeIfLocationChanged();
    };
    window.addEventListener("uml-route-change", closeForRouteChange);
    window.addEventListener("popstate", closeIfLocationChanged);
    return () => {
      window.removeEventListener("uml-route-change", closeForRouteChange);
      window.removeEventListener("popstate", closeIfLocationChanged);
    };
  }, [setDialogOpen]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  const clearPendingAvatar = useCallback(() => {
    setAvatarError("");
    setAvatarFile(null);
    setAvatarPreviewUrl((current) => {
      if (current && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(current);
      return "";
    });
  }, []);
  const selectAvatarFile = useCallback((file: File | null) => {
    setAvatarError("");

    if (!file) {
      clearPendingAvatar();
      return;
    }
    if (!AVATAR_FILE_TYPES.includes(file.type)) {
      clearPendingAvatar();
      setAvatarError(t("account.avatarTypeError"));
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      clearPendingAvatar();
      setAvatarError(t("account.avatarSizeError"));
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setAvatarPreviewUrl((current) => {
      if (current && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(current);
      }
      return objectUrl;
    });
    setAvatarFile(file);
  }, [t, clearPendingAvatar]);

  const closeAccountDialog = () => {
    setDialogOpen(false);
  };

  const keepAccountDialogOpen = useCallback(() => {
    dialogContentRef.current?.focus({ preventScroll: true });
    setDialogOpen(true);
    window.setTimeout(() => {
      setDialogOpen(true);
      dialogContentRef.current?.focus({ preventScroll: true });
    }, 0);
  }, [setDialogOpen]);

  const saveProfile = async () => {
    if (profileSaveInFlight.current) return;
    profileSaveInFlight.current = true;
    setProfileSaving(true);
    try {
      let response = await platformApi.updateAccountProfile({
        displayName,
        avatarUrl: avatarUrl.trim() || null,
      });
      if (avatarFile) {
        response = await platformApi.uploadAccountAvatar(avatarFile);
      }
      setUser(response.user);
      setDisplayName(response.user.displayName);
      setAvatarUrl(response.user.avatarUrl ?? "");
      setCurrentSessionId(response.session?.id ?? currentSessionId);
      setAvatarFile(null);
      setAvatarError("");
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      if (avatarPreviewUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
      setAvatarPreviewUrl("");
      floatingAlert.success(t("account.profileSaved"));
    } catch (_error) {
      floatingAlert.error(t("account.profileSaveFailed"));
    } finally {
      profileSaveInFlight.current = false;
      setProfileSaving(false);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) {
      floatingAlert.error(t("account.passwordRequired"));
      return;
    }

    setPasswordSubmitting(true);
    try {
      const response = await platformApi.changePassword({
        currentPassword,
        newPassword,
      });
      if (response.user) setUser(response.user);
      setCurrentSessionId(response.session?.id ?? currentSessionId);
      setCurrentPassword("");
      setNewPassword("");
      const refreshed = await platformApi.listAccountSessions().catch(() => null);
      if (refreshed) setSessions(refreshed.sessions);
      floatingAlert.success(t("account.passwordChanged"));
    } catch (_error) {
      floatingAlert.error(t("account.passwordChangeFailed"));
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const revokeOtherSessions = async () => {
    try {
      const result = await platformApi.revokeOtherSessions();
      const refreshed = await platformApi.listAccountSessions();
      setSessions(refreshed.sessions);
      floatingAlert.success(t("account.revokedOthers", { count: result.revokedCount }));
    } catch (_error) {
      floatingAlert.error(t("account.revokeFailed"));
    }
  };

  const startMfaSetup = async () => {
    try {
      const setup = await platformApi.setupMfa();
      setMfaSetup(setup);
      floatingAlert.success(t("account.mfaSetupReady"));
    } catch (_error) {
      floatingAlert.error(t("account.mfaSetupFailed"));
    }
  };

  const confirmMfa = async () => {
    try {
      const response = await platformApi.confirmMfa({ code: mfaCode });
      keepAccountDialogOpen();
      setMfaEnabled(response.mfa.enabled);
      setMfaSetup(null);
      setMfaCode("");
      floatingAlert.success(t("account.mfaEnabledSuccess"));
    } catch (_error) {
      floatingAlert.error(t("account.mfaEnableFailed"));
    }
  };

  const disableMfa = async () => {
    const trimmedCode = disableCode.trim();
    if (!trimmedCode) {
      floatingAlert.error(t("account.disableCodeRequired"));
      return;
    }

    try {
      const response = await platformApi.updateMfa({ enabled: false, code: trimmedCode });
      keepAccountDialogOpen();
      setMfaEnabled(response.mfa.enabled);
      setDisableCode("");
      floatingAlert.success(t("account.mfaDisabledSuccess"));
    } catch (_error) {
      floatingAlert.error(t("account.mfaDisableFailed"));
    }
  };

  const tabs = [
    { id: 'theme', label: t('account.block37.theme'), icon: Palette },
    { id: 'layout', label: t('account.block37.layout'), icon: LayoutDashboard },
    { id: 'language', label: t('account.block37.language'), icon: Languages },
    { id: 'profile', label: t('account.profile'), icon: User },
    { id: 'security', label: t('account.security'), icon: Shield },
    { id: 'sessions', label: t('account.sessions'), icon: Monitor },
    { id: 'global', label: t('account.block37.models'), icon: Settings },
  ];
  const tabTitle = activeTab === 'profile' ? t('account.profileTitle') : activeTab === 'sessions' ? t('account.activeSessions') : tabs.find(item => item.id === activeTab)?.label;
  const tabDescription = ['theme','layout','language'].includes(activeTab) ? t('account.block37.' + activeTab + 'Description') : activeTab === 'profile' ? t('account.profileDescription') : activeTab === 'security' ? t('account.securityDescription') : activeTab === 'sessions' ? t('account.activeSessionsDescription') : t('account.globalSettingsDescription');
  const instantPage = activeTab === 'security' || activeTab === 'sessions';
  const profileDirty = displayName !== (user?.displayName ?? '') || avatarUrl !== (user?.avatarUrl ?? '') || Boolean(avatarFile);
  const dirty = activeTab === 'profile' ? profileDirty : activeTab === 'global' ? modelDirty : preferences.dirty(activeTab);
  const resetProfile = useCallback(() => { setDisplayName(user?.displayName ?? ''); setAvatarUrl(user?.avatarUrl ?? ''); clearPendingAvatar(); if (avatarInputRef.current) avatarInputRef.current.value = ''; }, [user?.displayName, user?.avatarUrl, clearPendingAvatar]);
  const resetActivePage = () => { if (activeTab === 'profile') resetProfile(); else if (activeTab === 'global') modelActions.current?.reset(); else preferences.reset(activeTab); };
  const saveActivePage = () => { if (activeTab === 'profile') void saveProfile(); else if (activeTab === 'global') modelActions.current?.save(); else preferences.save(activeTab); };
  // Discard pending uploads and security input when the modal closes by any entry point.
  useEffect(() => {
    if (open) return;
    resetProfile();
    setCurrentPassword(''); setNewPassword(''); setMfaCode(''); setDisableCode(''); setMfaSetup(null);
    setActiveTab('theme');
  }, [open, resetProfile]);

  return (
    <Dialog
      open={open}
      onOpenChange={setDialogOpen}
    >
      {showTrigger && <DialogTrigger
        type="button"
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-md p-0.5 text-sm font-medium hover:bg-muted md:h-9 md:w-auto md:justify-start md:gap-2 md:pr-2",
          "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
          "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        )}
        aria-label={user ? t("auth.account") : t("auth.login")}
        title={user ? t("auth.account") : t("auth.login")}
      >
        <span className="inline-flex size-8 items-center justify-center overflow-hidden rounded-full bg-primary text-xs text-primary-foreground">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            initials(user)
          )}
        </span>
        <span className="hidden max-w-24 truncate md:inline">{title}</span>
        {user ? (
          <ShieldCheck className="hidden size-5 text-muted-foreground md:block" />
        ) : (
          <LogIn className="hidden size-5 text-muted-foreground md:block" />
        )}
      </DialogTrigger>}
      <DialogContent
        ref={dialogContentRef}
        showCloseButton={false}
        tabIndex={-1}
        data-block="dashboard-dialog-37"
        className="flex h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:h-170 sm:max-h-[calc(100dvh-2rem)] sm:max-w-[min(56rem,calc(100%-2rem))]"
      >
        <Button variant="ghost"
          type="button"
          data-slot="dialog-close"
          className="absolute top-4 right-4 z-10 opacity-70 hover:opacity-100 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          onClick={closeAccountDialog}
        >
          <X />
          <span className="sr-only">{t("account.close")}</span>
        </Button>
        {!user ? (
          <div className="grid gap-4 p-6">
            <DialogHeader>
              <DialogTitle>{t("auth.loginAccount")}</DialogTitle>
              <DialogDescription>{t("auth.loginDialogDescription")}</DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t("auth.guestRestriction")}
            </div>
            <Button
              onClick={() => {
                setDialogOpen(false);
                onNavigate("/login");
              }}
            >
              <LogIn className="size-4" />
              {t("auth.goToLogin")}
            </Button>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={value => { if (typeof value === 'string') setActiveTab(value); }} orientation="vertical" className="h-full min-h-0 w-full gap-0 max-md:flex-col">
            <div className="bg-muted/50 flex shrink-0 flex-col gap-3 border-b p-3 sm:p-4 md:w-56 md:gap-4 md:border-r md:border-b-0">
              <div className="space-y-1 pr-8 md:pr-0">
                <DialogTitle className="text-base font-semibold">{t("account.settings")}</DialogTitle>
                <DialogDescription className="text-xs max-sm:sr-only">{t("account.preferences")}</DialogDescription>
              </div>
              <TabsList aria-label={t("account.settings")} className="grid w-full grid-cols-7 gap-1 bg-transparent p-0 sm:flex sm:flex-row! sm:justify-start sm:overflow-x-auto md:flex-col! md:overflow-visible">
                {tabs.map(item => <TabsTrigger key={item.id} value={item.id} aria-label={item.label} className="h-9 flex-none justify-center! gap-2.5 px-0 text-sm sm:w-auto! sm:justify-start! sm:px-3 md:w-full!">
                  <item.icon className="size-4" /><span className="max-sm:sr-only">{item.label}</span>
                </TabsTrigger>)}
              </TabsList>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto" data-settings-scroll>
                <div className="bg-background sticky top-0 z-10 space-y-4 px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
                  <div className="space-y-1 pr-8">
                    <h3 className="text-lg font-semibold">{tabTitle}</h3>
                    <div className="flex items-center justify-between gap-3">
                      <p data-page-description className="min-w-0 flex-1 text-muted-foreground text-sm">{tabDescription.replace(/[。.]+$/u, '')}</p>
                      {activeTab === 'sessions' && <Button variant="ghost" size="sm" className="shrink-0" onClick={revokeOtherSessions}><LogOut className="size-4" />{t("account.revokeOthers")}</Button>}
                    </div>
                  </div>
                  {(activeTab === 'theme' || activeTab === 'layout' || activeTab === 'language') && <Block37Preview draft={preferences.draft} resolvedTheme={preferences.theme.systemTheme} kind={activeTab === 'language' ? 'locale' : 'app'} />}
                </div>
                <main className="min-w-0 px-4 pb-4 sm:px-6 sm:pb-5">
                  {loading && <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("account.loading")}</div>}
                  {status && <p role="status" className="py-3 text-sm">{status}</p>}
                  <AccountPreferencePages preferences={preferences} />
                  <TabsContent value="profile" keepMounted className="space-y-2">
                    <SettingRow label={t("account.changeAvatar")} hint="">
                  <div className="flex shrink-0 flex-col items-center gap-4">
                    <input
                      ref={avatarInputRef}
                      id="account-avatar-file"
                      aria-label={t("account.avatarAria")}
                      className="sr-only"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => selectAvatarFile(event.target.files?.[0] ?? null)}
                    />
                    <label
                      htmlFor="account-avatar-file"
                      className="group relative flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xl font-semibold text-primary shadow-sm"
                    >
                      <AccountAvatarPreview src={avatarPreviewSrc} user={user} />
                      <span className="absolute inset-0 flex items-center justify-center bg-background/75 opacity-0 transition-opacity group-hover:opacity-100">
                        <Camera className="size-5" />
                      </span>
                    </label>
                    {avatarFile && (
                      <div className="max-w-40 truncate text-xs text-muted-foreground">
                        {t("account.avatarSelected", { name: avatarFile.name })}
                      </div>
                    )}
                    {avatarError && <p className="max-w-44 text-center text-xs text-destructive">{avatarError}</p>}
                  </div>
                    </SettingRow>
                    <SettingRow label={t("account.displayName")} hint={t("account.profileDescription")} htmlFor="account-display-name">
                      <Input id="account-display-name" className="h-9 w-full sm:w-56" value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder={t("account.displayNamePlaceholder")} />
                    </SettingRow>
                    <SettingRow label={t("account.email")} hint={user.emailVerified ? t("account.emailVerified") : t("account.emailUnverified")} htmlFor="account-email">
                      <Input id="account-email" className="h-9 w-full sm:w-56" value={user.email} readOnly />
                    </SettingRow>
                    <SettingRow label={t("account.accountStatus")} hint={t("account.profileDescription")}>
                      <div className="flex flex-wrap gap-2"><Badge variant="outline">{accountStatus}</Badge><Badge variant="outline">{mfaEnabled ? t("account.mfaEnabled") : t("account.mfaDisabled")}</Badge></div>
                    </SettingRow>
                  </TabsContent>
              <TabsContent value="security" keepMounted className="space-y-2">
                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                    <KeyRound className="size-4 text-primary" />
                    {t("account.changePassword")}
                  </div>
                  <div className="grid gap-4 text-sm">
                    <div className="grid gap-1.5">
                      <Label htmlFor="account-current-password">{t("account.currentPassword")}</Label>
                      <Input
                        id="account-current-password"
                        type="password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        autoComplete="current-password"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="account-new-password">{t("account.newPassword")}</Label>
                      <Input
                        id="account-new-password"
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={changePassword}
                        disabled={passwordSubmitting || !currentPassword || !newPassword}
                      >
                        {passwordSubmitting ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <KeyRound className="size-4" />
                        )}
                        {t("account.changePassword")}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold text-foreground">
                    <KeyRound className="size-4 text-primary" />
                    {t("account.mfaTitle")}
                  </div>
                  {!mfaEnabled && !mfaSetup && (
                    <div className="grid gap-4 text-sm text-muted-foreground">
                      <p>{t("account.mfaDescription")}</p>
                      <div>
                        <Button variant="outline" onClick={startMfaSetup}>
                          <ShieldCheck className="size-4" />
                          {t("account.enableMfa")}
                        </Button>
                      </div>
                    </div>
                  )}
                  {mfaSetup && (
                    <MfaSetupPanel
                      setup={mfaSetup}
                      code={mfaCode}
                      onCodeChange={setMfaCode}
                      onConfirm={confirmMfa}
                      className="bg-background"
                    />
                  )}
                  {mfaEnabled && (
                    <div className="grid gap-3 text-sm">
                      <p className="text-muted-foreground">{t("account.mfaEnabledDescription")}</p>
                      <div className="grid gap-1.5">
                        <Label htmlFor="account-disable-mfa-code">{t("account.disableCode")}</Label>
                        <Input
                          id="account-disable-mfa-code"
                          value={disableCode}
                          onChange={(event) => setDisableCode(event.target.value)}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          placeholder={t("account.codePlaceholder")}
                        />
                      </div>
                      <div>
                        <Button variant="outline" onClick={disableMfa} disabled={!disableCode.trim()}>
                          {t("account.disableMfa")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

              </TabsContent>


                  <TabsContent value="sessions" keepMounted className="space-y-3">
                    <ul aria-label={t("account.activeSessions")} className="divide-y rounded-md border">
                      {visibleSessions.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t("account.noSessions")}</li> : visibleSessions.map(session => <li key={session.id} className={cn("flex items-start gap-3 px-3 py-3", session.id === currentSessionId && "bg-primary/5")}>
                        <Avatar size="lg"><AvatarFallback><Laptop aria-hidden="true" className="size-5" /></AvatarFallback></Avatar>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2"><span className="break-words font-medium">{formatSessionDevice(session.userAgent, t("account.unknownDevice"))}</span>{session.id === currentSessionId && <Badge variant="outline">{t("account.currentDevice")}</Badge>}</div>
                          <p className="break-words text-sm text-muted-foreground">{t("account.regionHeader")}: {formatSessionRegion(session, t("account.unknownRegion"))}</p>
                          <p className="text-xs text-muted-foreground">{t("account.lastActiveHeader")}: {formatDate(session.lastSeenAt, locale, t("account.none"))}</p>
                          <p className="text-xs text-muted-foreground">{t("account.expiresHeader")}: {formatDate(session.expiresAt, locale, t("account.none"))}</p>
                        </div>
                      </li>)}
                    </ul>
                  </TabsContent>
                  <TabsContent value="global" keepMounted className="space-y-2">
                    <GlobalSettingsPanel ref={modelActions} embedded onDirtyChange={setModelDirty} active={open} currentUserId={userId ?? ""} onNavigate={route => { setDialogOpen(false); onNavigate(route); }} />
                  </TabsContent>
                  <div className="sr-only" aria-live="polite">{currentSessionId ? t("account.currentSession", { id: currentSessionId }) : ""}</div>
                </main>
              </div>
              <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
                <p aria-live="polite" className="text-muted-foreground flex items-center gap-2 text-sm">{instantPage ? t("account.block37.instant") : dirty ? <><span className="size-2 rounded-full bg-amber-600 dark:bg-amber-400" />{t("account.block37.unsaved")}</> : ["theme", "layout", "language"].includes(activeTab) && preferences.saved ? t("account.block37.saved") : t("account.block37.allSaved")}</p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={resetActivePage} disabled={instantPage || profileSaving}>{t("account.block37.reset")}</Button>
                  <Button variant="outline" onClick={closeAccountDialog} disabled={profileSaving}>{t("account.block37.cancel")}</Button>
                  <Button onClick={saveActivePage} disabled={instantPage || !dirty || loading || profileSaving}>{profileSaving && <Loader2 className="size-4 animate-spin" />}{activeTab === 'profile' ? t("account.saveProfile") : t("account.block37.save")}</Button>
                </div>
              </div>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
