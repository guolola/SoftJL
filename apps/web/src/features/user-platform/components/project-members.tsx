// Owns project member invitation, role, and removal interactions.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { UserRoundPlus, Plus } from "lucide-react";
import { projectInvitationCreateRequestSchema } from "@uml-platform/contracts";
import { localizeCaughtFailure } from "../../../shared/i18n/api-errors";
import { Alert } from "../../../shared/ui/alert";
import { Button } from "../../../shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "../../../shared/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../../../shared/ui/input-group";
import { SelectControl } from "../../../shared/ui/select";
import { Separator } from "../../../shared/ui/separator";
import { useFloatingAlert } from "../../../shared/ui/floating-alert";
import { invitationToMember, memberRoleLabel } from "../lib/project-workspace-presentation";
import { PlatformApiError, platformApi, type PlatformProject, type PlatformProjectMember } from "../services/platform-api";
import { ProjectMemberRow } from "./project-member-row";
import { useAuthenticatedRouteSession } from "./authenticated-route-session";

export function ProjectMembers({
  project,
  members,
  membershipRole = null,
  layout = "page",
}: {
  project: PlatformProject;
  members: PlatformProjectMember[];
  membershipRole?: string | null;
  layout?: "page" | "drawer";
}) {
  const { t } = useTranslation();
  const { showAlert } = useFloatingAlert();
  const session = useAuthenticatedRouteSession();
  const [currentMembers, setCurrentMembers] = useState(members);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteFieldError, setInviteFieldError] = useState("");
  const canManageMembers = !membershipRole || membershipRole === "owner" || membershipRole === "editor";

  useEffect(() => {
    setCurrentMembers(members);
  }, [members]);

  const inviteMember = async () => {
    if (!canManageMembers) {
      showAlert({ title: t("projectShell.membersUi.errors.inviteReadonly"), tone: "warning" });
      return;
    }
    if (!inviteUsername.trim()) {
      setInviteFieldError(t("projectShell.membersUi.errors.usernameRequired"));
      return;
    }
    // Use the API contract's username rule so client and server accept the same format.
    const parsedUsername = projectInvitationCreateRequestSchema.shape.username.safeParse(inviteUsername);
    if (!parsedUsername.success) {
      setInviteFieldError(t("projectShell.membersUi.errors.usernameInvalid"));
      return;
    }
    const username = parsedUsername.data;
    if (username === session?.user.username.trim().toLowerCase()) {
      setInviteFieldError(t("errors.codes.PROJECT_INVITATION_SELF"));
      return;
    }
    if (currentMembers.some((member) => member.username.trim().toLowerCase() === username)) {
      setInviteFieldError(t("errors.codes.PROJECT_INVITATION_ALREADY_EXISTS"));
      return;
    }
    setInviteFieldError("");
    const optimisticMember: PlatformProjectMember = {
      id: `pending-${username}`,
      projectId: project.id,
      userId: "",
      username,
      displayName: username,
      role: inviteRole,
      status: "invited",
      invitedAt: new Date().toISOString(),
      joinedAt: null,
    };
    setCurrentMembers((current) => [...current, optimisticMember]);
    try {
      const response = await platformApi.inviteProjectMember(project.id, {
        username,
        role: inviteRole,
      });
      const nextMember =
        response.member ??
        invitationToMember(project.id, response.invitation ?? {
          id: `invitation-${username}`,
          projectId: project.id,
          username,
          role: inviteRole,
          status: "invited",
          invitedAt: new Date().toISOString(),
        });
      setCurrentMembers((current) =>
        current.map((member) => (member.id === optimisticMember.id ? nextMember : member)),
      );
      setInviteUsername("");
      setInviteOpen(false);
      const success = t("projectShell.membersUi.messages.invited", { username: nextMember.username });
      showAlert({ title: success, tone: "success" });
    } catch (error) {
      setCurrentMembers((current) => current.filter((member) => member.id !== optimisticMember.id));
      const failure = localizeCaughtFailure(error, t("projectShell.membersUi.errors.invite"));
      if (error instanceof PlatformApiError && ["PROJECT_INVITATION_SELF", "PROJECT_INVITATION_USER_NOT_REGISTERED", "PROJECT_INVITATION_ALREADY_EXISTS", "VALIDATION_FAILED"].includes(error.code ?? "")) {
        setInviteFieldError(failure);
        return;
      }
      showAlert({ title: failure, tone: "destructive" });
    }
  };

  const updateRole = async (memberId: string, role: string) => {
    if (!canManageMembers) {
      showAlert({ title: t("projectShell.membersUi.errors.roleReadonly"), tone: "warning" });
      return;
    }
    const member = currentMembers.find((item) => item.id === memberId);
    // The sole active owner must remain available to manage and transfer ownership.
    if (member?.role === "owner" && ownerCount <= 1 && role !== "owner") {
      showAlert({ title: t("projectShell.membersUi.lastOwnerRemoveHint"), tone: "warning" });
      return;
    }
    try {
      const response = await platformApi.updateProjectMemberRole(project.id, memberId, role);
      setCurrentMembers((current) =>
        current.map((member) =>
          member.id === memberId ? { ...member, ...response.member } : member,
        ),
      );
      const success = t("projectShell.membersUi.messages.roleUpdated", {
        username: response.member.username,
        role: memberRoleLabel(response.member.role, t),
      });
      showAlert({ title: success, tone: "success" });
    } catch {
      const failure = t("projectShell.membersUi.errors.role");
      showAlert({ title: failure, tone: "destructive" });
    }
  };

  const removeMember = async (member: PlatformProjectMember) => {
    if (!canManageMembers) {
      showAlert({ title: t("projectShell.membersUi.errors.removeReadonly"), tone: "warning" });
      return;
    }
    if (member.role === "owner" && ownerCount <= 1) {
      showAlert({ title: t("projectShell.membersUi.lastOwnerRemoveHint"), tone: "warning" });
      return;
    }
    try {
      await platformApi.removeProjectMember(project.id, member.id);
      setCurrentMembers((current) => current.filter((item) => item.id !== member.id));
      const success = t("projectShell.membersUi.messages.removed", { username: member.username });
      showAlert({ title: success, tone: "success" });
    } catch {
      const failure = t("projectShell.membersUi.errors.remove");
      showAlert({ title: failure, tone: "destructive" });
    }
  };

  const resendInvitation = async (member: PlatformProjectMember) => {
    if (!canManageMembers) {
      showAlert({ title: t("projectShell.membersUi.errors.resendReadonly"), tone: "warning" });
      return;
    }
    try {
      const response = await platformApi.resendProjectInvitation(project.id, member.id);
      const nextMember =
        response.member ??
        (response.invitation
          ? invitationToMember(project.id, response.invitation)
          : { ...member, status: "invited", invitedAt: new Date().toISOString() });
      setCurrentMembers((current) =>
        current.map((item) => (item.id === member.id ? { ...item, ...nextMember } : item)),
      );
      const success = t("projectShell.membersUi.messages.resent", { username: member.username });
      showAlert({ title: success, tone: "success" });
    } catch {
      const failure = t("projectShell.membersUi.errors.resend");
      showAlert({ title: failure, tone: "destructive" });
    }
  };

  const revokeInvitation = async (member: PlatformProjectMember) => {
    if (!canManageMembers) {
      showAlert({ title: t("projectShell.membersUi.errors.revokeReadonly"), tone: "warning" });
      return;
    }
    try {
      await platformApi.revokeProjectInvitation(project.id, member.id);
      setCurrentMembers((current) =>
        current.map((item) =>
          item.id === member.id ? { ...item, status: "revoked" } : item,
        ),
      );
      const success = t("projectShell.membersUi.messages.revoked", { username: member.username });
      showAlert({ title: success, tone: "success" });
    } catch {
      const failure = t("projectShell.membersUi.errors.revoke");
      showAlert({ title: failure, tone: "destructive" });
    }
  };

  // Revoked invitations are no longer actionable; expired invitations can still be resent.
  const activeMembers = currentMembers.filter((member) => member.status === "active");
  const pendingInvitations = currentMembers.filter((member) => member.status === "invited" || member.status === "expired");
  const ownerCount = currentMembers.filter((member) => member.status === "active" && member.role === "owner").length;
  const roleOptions = [
    { value: "viewer", label: t("projectShell.membersUi.roles.viewer") },
    { value: "editor", label: t("projectShell.membersUi.roles.editor") },
  ];
  const memberRoleOptions = [
    { value: "owner", label: t("projectShell.membersUi.roles.owner") },
    ...roleOptions,
  ];
  const renderMember = (member: PlatformProjectMember, pending = false) => (
    <ProjectMemberRow
      member={member}
      pending={pending}
      canManage={canManageMembers}
      isLastOwner={!pending && member.role === "owner" && ownerCount <= 1}
      roleOptions={pending ? roleOptions : memberRoleOptions}
      onRoleChange={updateRole}
      onRemove={removeMember}
      onResend={resendInvitation}
      onRevoke={revokeInvitation}
    />
  );

  return (
    <section className="min-w-0 py-3" data-layout={layout}>
      <div className="mx-auto max-w-7xl">
        {!canManageMembers && <Alert className="mb-6 text-sm leading-6">{t("projectShell.membersUi.readonly")}</Alert>}
        {/* Preserve account-settings-05's header, member rows, and separate invitation list. */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-semibold">{t("projectShell.membersUi.title")}</h3>
            <p className="text-muted-foreground text-sm">{t("projectShell.membersUi.description")}</p>
          </div>
          <Button
            type="button"
            className="max-sm:w-full"
            onClick={() => { setInviteFieldError(""); setInviteOpen(true); }}
            disabled={!canManageMembers}
          >
            <Plus aria-hidden="true" />
            {t("projectShell.membersUi.inviteTitle")}
          </Button>
        </div>
        <div role="group" aria-label={t("projectShell.membersUi.title")}>
          {activeMembers.map((member, index) => (
            <div key={member.id}>
              {renderMember(member)}
              {index !== activeMembers.length - 1 && <Separator className="my-2" />}
            </div>
          ))}
          {activeMembers.length === 0 && <p className="text-muted-foreground text-sm">{t("projectShell.membersUi.empty")}</p>}
        </div>
        <div className="mt-10">
          <h3 className="font-medium">{t("projectShell.membersUi.pendingInvitations")}</h3>
          <div className="mt-6" role="group" aria-label={t("projectShell.membersUi.pendingInvitations")}>
            {pendingInvitations.map((member, index) => (
              <div key={member.id}>
                {renderMember(member, true)}
                {index !== pendingInvitations.length - 1 && <Separator className="my-2" />}
              </div>
            ))}
            {pendingInvitations.length === 0 && <p className="text-muted-foreground text-sm">{t("projectShell.membersUi.noPendingInvitations")}</p>}
          </div>
        </div>
        <Dialog
          open={inviteOpen}
          onOpenChange={(next) => {
            setInviteOpen(next);
            if (!next) setInviteFieldError("");
          }}
        >
          <DialogContent className="sm:max-w-lg [&>[data-slot=dialog-close]>svg]:size-5">
            <DialogHeader>
              <DialogTitle className="m-0 text-lg">{t("projectShell.membersUi.inviteDialogTitle")}</DialogTitle>
              <DialogDescription className="text-sm">{t("projectShell.membersUi.inviteDescription")}</DialogDescription>
            </DialogHeader>
            <FieldGroup className="mt-4 grid grid-cols-1 gap-4">
              <Field>
                <FieldLabel htmlFor="member-invite-username" className="gap-1">
                  {t("projectShell.membersUi.usernameLabel")}<span className="text-destructive">*</span>
                </FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="member-invite-username"
                    type="text"
                    value={inviteUsername}
                    onChange={(event) => {
                      setInviteUsername(event.target.value);
                      if (event.target.value.trim()) setInviteFieldError("");
                    }}
                    placeholder={t("projectShell.membersUi.usernamePlaceholder")}
                    disabled={!canManageMembers}
                    required
                    aria-invalid={!!inviteFieldError}
                    aria-describedby={inviteFieldError ? "member-invite-username-error" : undefined}
                  />
                  <InputGroupAddon align="inline-end"><UserRoundPlus className="size-4" aria-hidden="true" /></InputGroupAddon>
                </InputGroup>
                {inviteFieldError && <FieldError id="member-invite-username-error">{inviteFieldError}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="member-invite-role">{t("projectShell.membersUi.inviteRole")}</FieldLabel>
                <SelectControl
                  id="member-invite-role"
                  aria-label={t("projectShell.membersUi.inviteRole")}
                  value={inviteRole}
                  onValueChange={setInviteRole}
                  disabled={!canManageMembers}
                  options={roleOptions}
                />
              </Field>
            </FieldGroup>
            <DialogFooter className="gap-4 sm:gap-4">
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>{t("projectShell.membersUi.cancel")}</Button>
              <Button type="button" onClick={() => void inviteMember()} disabled={!canManageMembers}>{t("projectShell.membersUi.sendInvite")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
