// Owns project member invitation, role, and removal interactions.
import { Alert } from "../../../shared/ui/alert";
import { Avatar, AvatarFallback } from "../../../shared/ui/avatar";
import { Card } from "../../../shared/ui/card";
import { Input } from '../../../shared/ui/input';
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, UserRoundMinus, UserRoundPlus } from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../../../shared/ui/field";
import { SelectControl } from "../../../shared/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../shared/ui/table";
import { TablePagination, TableToolbar } from "../../../shared/template/layout/page";
import { useFloatingAlert } from "../../../shared/ui/floating-alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../shared/ui/tooltip";
import { cn } from "../../../shared/ui/utils";
import {
  formatMemberDate,
  invitationToMember,
  memberInitials,
  memberRoleLabel,
  memberStatusLabel,
} from "../lib/project-workspace-presentation";
import {
  platformApi,
  type PlatformProject,
  type PlatformProjectMember,
} from "../services/platform-api";

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
  const { t, i18n } = useTranslation();
  const { showAlert } = useFloatingAlert();
  const locale = i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "zh-CN";
  const [currentMembers, setCurrentMembers] = useState(members);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [memberFilter, setMemberFilter] = useState<"all" | "active" | "invited">("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [inviteFieldError, setInviteFieldError] = useState("");
  const inviteEmailRef = useRef<HTMLInputElement | null>(null);
  const canManageMembers = !membershipRole || membershipRole === "owner" || membershipRole === "editor";

  useEffect(() => {
    setCurrentMembers(members);
    setPage(1);
  }, [members]);

  const inviteMember = async () => {
    if (!canManageMembers) {
      showAlert({ title: t("projectShell.membersUi.errors.inviteReadonly"), tone: "warning" });
      return;
    }
    const email = (inviteEmailRef.current?.value ?? inviteEmail).trim();
    if (!email) {
      setInviteFieldError(t("projectShell.membersUi.errors.emailRequired"));
      return;
    }
    setInviteFieldError("");
    const optimisticMember: PlatformProjectMember = {
      id: `pending-${email}`,
      projectId: project.id,
      userId: "",
      email,
      displayName: email,
      role: inviteRole,
      status: "invited",
      invitedAt: new Date().toISOString(),
      joinedAt: null,
    };
    setCurrentMembers((current) => [...current, optimisticMember]);
    try {
      const response = await platformApi.inviteProjectMember(project.id, {
        email,
        role: inviteRole,
      });
      const nextMember =
        response.member ??
        invitationToMember(project.id, response.invitation ?? {
          id: `invitation-${email}`,
          projectId: project.id,
          email,
          role: inviteRole,
          status: "invited",
          invitedAt: new Date().toISOString(),
        });
      setCurrentMembers((current) =>
        current.map((member) => (member.id === optimisticMember.id ? nextMember : member)),
      );
      setInviteEmail("");
      if (inviteEmailRef.current) {
        inviteEmailRef.current.value = "";
      }
      setInviteOpen(false);
      const success = t("projectShell.membersUi.messages.invited", { email: nextMember.email });
      showAlert({ title: success, tone: "success" });
    } catch {
      setCurrentMembers((current) => current.filter((member) => member.id !== optimisticMember.id));
      const failure = t("projectShell.membersUi.errors.invite");
      showAlert({ title: failure, tone: "destructive" });
    }
  };

  const updateRole = async (memberId: string, role: string) => {
    if (!canManageMembers) {
      showAlert({ title: t("projectShell.membersUi.errors.roleReadonly"), tone: "warning" });
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
        email: response.member.email,
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
    try {
      await platformApi.removeProjectMember(project.id, member.id);
      setCurrentMembers((current) => current.filter((item) => item.id !== member.id));
      const success = t("projectShell.membersUi.messages.removed", { email: member.email });
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
      const success = t("projectShell.membersUi.messages.resent", { email: member.email });
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
      const success = t("projectShell.membersUi.messages.revoked", { email: member.email });
      showAlert({ title: success, tone: "success" });
    } catch {
      const failure = t("projectShell.membersUi.errors.revoke");
      showAlert({ title: failure, tone: "destructive" });
    }
  };

  const filteredMembers = currentMembers.filter((member) => {
    if (memberFilter === "active" && member.status !== "active") return false;
    if (
      memberFilter === "invited" &&
      member.status !== "invited" &&
      member.status !== "expired"
    ) {
      return false;
    }
    if (roleFilter !== "all" && member.role !== roleFilter) return false;
    const query = searchFilter.trim().toLowerCase();
    if (query) {
      const identity = `${member.displayName ?? ""} ${member.email}`.toLowerCase();
      if (!identity.includes(query)) return false;
    }
    return true;
  });

  const activeCount = currentMembers.filter((member) => member.status === "active").length;
  const invitedCount = currentMembers.filter(
    (member) => member.status === "invited" || member.status === "expired",
  ).length;
  const ownerCount = currentMembers.filter((member) => member.status === "active" && member.role === "owner").length;
  const editorCount = currentMembers.filter((member) => member.status === "active" && member.role === "editor").length;
  const viewerCount = currentMembers.filter((member) => member.status === "active" && member.role === "viewer").length;
  const roleOptions = [
    { value: "viewer", label: t("projectShell.membersUi.roles.viewer") },
    { value: "editor", label: t("projectShell.membersUi.roles.editor") },
  ];
  const memberRoleOptions = [
    { value: "owner", label: t("projectShell.membersUi.roles.owner") },
    ...roleOptions,
  ];
  const containerClass =
    layout === "drawer"
      ? "grid min-w-0 max-w-full gap-4 overflow-hidden"
      : "grid gap-5";
  const pageCount = Math.max(1, Math.ceil(filteredMembers.length / pageSize));
  const pagedMembers = filteredMembers.slice((page - 1) * pageSize, page * pageSize);
  return (
    <div className={containerClass}>
      {!canManageMembers && (
        <Alert className="text-sm leading-6">
          {t("projectShell.membersUi.readonly")}
        </Alert>
      )}
      {/* users-list idiom: toolbar -> table -> pagination inside one flat card */}
      <Card className="min-w-0 max-w-full overflow-hidden border py-0 shadow-none ring-0">
        <TableToolbar
          search={searchFilter}
          onSearchChange={(value) => {
            setSearchFilter(value);
            setPage(1);
          }}
          searchPlaceholder={t("projectShell.membersUi.searchPlaceholder")}
          searchLabel={t("projectShell.membersUi.searchPlaceholder")}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(nextPageSize) => {
            setPageSize(nextPageSize);
            setPage(1);
          }}
          filters={
            <>
              <SelectControl
                aria-label={t("projectShell.membersUi.statusFilter")}
                value={memberFilter}
                onValueChange={(value) => {
                  setMemberFilter(value as "all" | "active" | "invited");
                  setPage(1);
                }}
                className="w-fit"
                options={[
                  { value: "all", label: t("projectShell.membersUi.filters.all") },
                  { value: "active", label: t("projectShell.membersUi.status.active") },
                  { value: "invited", label: t("projectShell.membersUi.status.invited") },
                ]}
              />
              <SelectControl
                aria-label={t("projectShell.membersUi.roleFilter")}
                value={roleFilter}
                onValueChange={(value) => {
                  setRoleFilter(value);
                  setPage(1);
                }}
                className="w-fit"
                options={[
                  { value: "all", label: t("projectShell.membersUi.allRoles") },
                  { value: "owner", label: t("projectShell.membersUi.roles.owner") },
                  ...roleOptions,
                ]}
              />
            </>
          }
          actions={
            <Button
              type="button"
              onClick={() => {
                setInviteFieldError("");
                setInviteOpen(true);
              }}
              disabled={!canManageMembers}
            >
              <UserRoundPlus className="size-4" />
              {t("projectShell.membersUi.inviteTitle")}
            </Button>
          }
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("projectShell.membersUi.columns.member")}</TableHead>
              <TableHead>{t("projectShell.membersUi.columns.status")}</TableHead>
              <TableHead>{t("projectShell.membersUi.columns.role")}</TableHead>
              <TableHead>{t("projectShell.membersUi.columns.joined")}</TableHead>
              <TableHead>{t("projectShell.membersUi.columns.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedMembers.map((member) => {
              const invitationLike = member.status === "invited" || member.status === "expired";
              const isLastOwner = member.role === "owner" && ownerCount <= 1;
              const displayName = member.displayName || member.email;
              const invitedAtText = t("projectShell.membersUi.invitedAt", {
                date: member.invitedAt
                  ? formatMemberDate(member.invitedAt, locale, t)
                  : t("projectShell.membersUi.noTime"),
                role: memberRoleLabel(member.role, t),
              });
              return (
                <TableRow
                  key={member.id}
                  data-testid="project-member-card"
                  className={cn("max-w-full min-w-0", invitationLike && "bg-muted/30")}
                >
                  <TableCell className="min-w-0 max-w-64">
                    {/* Two-line member cell mirrors admin datatable-transaction */}
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar className="size-9">
                        {member.avatarUrl && !invitationLike ? (
                          <img
                            src={member.avatarUrl}
                            alt={t("projectShell.membersUi.avatar", { name: displayName })}
                            className="size-full rounded-full object-cover"
                          />
                        ) : (
                          <AvatarFallback
                            className={cn(
                              "text-xs",
                              invitationLike
                                ? "text-muted-foreground border border-dashed"
                                : "bg-primary/10 text-primary",
                            )}
                          >
                            {invitationLike ? <Mail className="size-4" /> : memberInitials(member)}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="flex min-w-0 flex-col text-sm">
                        <span className="truncate font-medium" title={displayName}>
                          {displayName}
                        </span>
                        <span className="text-muted-foreground truncate text-xs" title={member.email}>
                          {member.email}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {invitationLike ? (
                      <Badge variant={member.status === "expired" ? "destructive" : "secondary"}>
                        {memberStatusLabel(member.status, t)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                        {memberStatusLabel(member.status, t)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {invitationLike ? (
                      <span className="text-muted-foreground block max-w-40 truncate text-xs" title={invitedAtText}>
                        {invitedAtText}
                      </span>
                    ) : (
                      <SelectControl
                        aria-label={t("projectShell.membersUi.memberRole", { email: member.email })}
                        value={member.role}
                        onValueChange={(value) => void updateRole(member.id, value)}
                        disabled={!canManageMembers}
                        className="min-w-24"
                        size="sm"
                        options={memberRoleOptions.map((role) => ({
                          value: role.value,
                          label: role.label,
                        }))}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {member.joinedAt
                      ? t("projectShell.membersUi.joinedAt", {
                          date: formatMemberDate(member.joinedAt, locale, t),
                        })
                      : t("projectShell.membersUi.noTime")}
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-0 flex-wrap justify-end gap-2">
                      {invitationLike ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void resendInvitation(member)}
                            disabled={!canManageMembers}
                            aria-label={t("projectShell.membersUi.resendFor", { email: member.email })}
                          >
                            {t("projectShell.membersUi.resend")}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => void revokeInvitation(member)}
                            disabled={!canManageMembers}
                            aria-label={t("projectShell.membersUi.revokeFor", { email: member.email })}
                          >
                            {t("projectShell.membersUi.revoke")}
                          </Button>
                        </>
                      ) : (
                        isLastOwner || !canManageMembers ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span
                                  tabIndex={0}
                                  aria-label={
                                    isLastOwner
                                      ? t("projectShell.membersUi.lastOwnerRemoveHint")
                                      : t("projectShell.membersUi.errors.removeReadonly")
                                  }
                                  className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                              }
                            >
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="size-8"
                                disabled
                                aria-label={t("projectShell.membersUi.removeFor", { email: member.email })}
                              >
                                <UserRoundMinus className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {isLastOwner
                                ? t("projectShell.membersUi.lastOwnerRemoveHint")
                                : t("projectShell.membersUi.errors.removeReadonly")}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="size-8"
                            onClick={() => void removeMember(member)}
                            aria-label={t("projectShell.membersUi.removeFor", { email: member.email })}
                          >
                            <UserRoundMinus className="size-4" />
                          </Button>
                        )
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {currentMembers.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className="text-muted-foreground p-4 text-center text-sm">
                    {t("projectShell.membersUi.empty")}
                  </div>
                </TableCell>
              </TableRow>
            )}
            {currentMembers.length > 0 && filteredMembers.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className="text-muted-foreground p-4 text-center text-sm">
                    {t("projectShell.membersUi.noMatches")}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          total={filteredMembers.length}
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          onPageChange={setPage}
          itemLabel={t("projectShell.membersUi.countLabel")}
        />
      </Card>
      <Dialog
        open={inviteOpen}
        onOpenChange={(next) => {
          setInviteOpen(next);
          if (!next) setInviteFieldError("");
        }}
      >
        <DialogContent data-form-layout="4" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("projectShell.membersUi.inviteTitle")}</DialogTitle>
          </DialogHeader>
          <FieldGroup className="rounded-xl border border-border bg-muted/10 p-4 sm:p-5">
            <Field>
              <FieldLabel htmlFor="member-invite-email">
                {t("projectShell.membersUi.emailLabel")}
              </FieldLabel>
              <Input
                id="member-invite-email"
                type="email"
                ref={inviteEmailRef}
                defaultValue={inviteEmail}
                onChange={(event) => {
                  setInviteEmail(event.target.value);
                  if (event.target.value.trim()) setInviteFieldError("");
                }}
                placeholder={t("projectShell.membersUi.emailPlaceholder")}
                disabled={!canManageMembers}
              />
              {inviteFieldError && <FieldError>{inviteFieldError}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="member-invite-role">
                {t("projectShell.membersUi.inviteRole")}
              </FieldLabel>
              <SelectControl
                id="member-invite-role"
                aria-label={t("projectShell.membersUi.inviteRole")}
                value={inviteRole}
                onValueChange={setInviteRole}
                disabled={!canManageMembers}
                options={roleOptions.map((role) => ({
                  value: role.value,
                  label: role.label,
                }))}
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
              {t("projectShell.membersUi.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void inviteMember()}
              disabled={!canManageMembers}
            >
              <Mail className="size-4" />
              {t("projectShell.membersUi.sendInvite")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
