// Handles project invitation token inspection and acceptance from public auth routes.
import { Card } from "../../../shared/ui/card";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { getQueryParam } from "../lib/auth-page-routing";
import { memberRoleLabel } from "../lib/project-workspace-presentation";
import {
  PlatformApiError,
  platformApi,
  type PlatformProjectInvitation,
} from "../services/platform-api";

type Navigate = (path: string) => void;

export function InvitationAcceptPage({ onNavigate }: { onNavigate: Navigate }) {
  const { t } = useTranslation();
  const token = getQueryParam("token");
  const [loading, setLoading] = useState(Boolean(token));
  const [accepting, setAccepting] = useState(false);
  const [invitation, setInvitation] = useState<PlatformProjectInvitation | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (!token) {
      setLoading(false);
      setMessage(t("auth.invitationAccept.tokenMissing"));
      return () => {
        active = false;
      };
    }
    setLoading(true);
    platformApi.inspectInvitation(token)
      .then((response) => {
        if (!active) return;
        setInvitation(response.invitation);
        setMessage("");
      })
      .catch(() => {
        if (!active) return;
        setMessage(t("auth.invitationAccept.invalid"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t, token]);

  const accept = async () => {
    if (!token) return;
    setAccepting(true);
    setMessage("");
    try {
      await platformApi.acceptInvitation(token);
      setMessage(t("auth.invitationAccept.accepted"));
      onNavigate("/projects");
    } catch (error) {
      const status = error instanceof PlatformApiError ? error.status : 0;
      if (status === 401) {
        const redirect = `/invitations/accept?token=${encodeURIComponent(token)}`;
        onNavigate(`/login?redirect=${encodeURIComponent(redirect)}`);
        return;
      }
      setMessage(t("auth.invitationAccept.failed"));
    } finally {
      setAccepting(false);
    }
  };

  const projectName = invitation?.project?.name ?? t("auth.invitationAccept.projectFallback");
  const invitedEmail = invitation?.email ?? t("auth.invitationAccept.emailFallback");

  return (
    <main className="min-h-0 flex-1 overflow-auto bg-background px-4 py-10 text-foreground md:px-12">
      <Card as="section" className="gap-0 py-0 mx-auto max-w-xl p-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-semibold leading-8">{t("auth.invitationAccept.title")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("auth.invitationAccept.description")}
          </p>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("auth.invitationAccept.loading")}
          </div>
        ) : invitation ? (
          <div className="grid gap-4">
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="text-sm text-muted-foreground">{t("auth.invitationAccept.project")}</p>
              <p className="mt-1 font-medium">{projectName}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="text-sm text-muted-foreground">{t("auth.invitationAccept.email")}</p>
              <p className="mt-1 font-medium">{invitedEmail}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="text-sm text-muted-foreground">{t("auth.invitationAccept.role")}</p>
              <p className="mt-1 font-medium">{memberRoleLabel(invitation.role, t)}</p>
            </div>
          </div>
        ) : null}
        {message && (
          <div className="mt-5 rounded-lg border border-border bg-muted p-4 text-sm leading-6 text-muted-foreground">
            {message}
          </div>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button type="button" className="h-11 flex-1" onClick={() => void accept()} disabled={!invitation || accepting}>
            {accepting && <Loader2 className="size-4 animate-spin" />}
            {t("auth.invitationAccept.accept")}
          </Button>
          <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => onNavigate(`/register?invitationToken=${encodeURIComponent(token)}`)}>
            {t("auth.invitationAccept.register")}
          </Button>
        </div>
        <Button variant="ghost" type="button" className="mt-4 text-sm hover:underline" onClick={() => onNavigate("/login")}>
          {t("auth.invitationAccept.backToLogin")}
        </Button>
      </Card>
    </main>
  );
}
