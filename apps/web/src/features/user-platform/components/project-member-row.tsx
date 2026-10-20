// Adapts the account-settings-05 member row to project roles and invitation actions.
import { BadgeCheck, EllipsisVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "../../../shared/ui/avatar";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../shared/ui/dropdown-menu";
import { SelectControl, type SelectControlOption } from "../../../shared/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../shared/ui/tooltip";
import { cn } from "../../../shared/ui/utils";
import { formatMemberDate, memberInitials, memberStatusLabel } from "../lib/project-workspace-presentation";
import type { PlatformProjectMember } from "../services/platform-api";

export function ProjectMemberRow({
  member,
  pending = false,
  canManage,
  isLastOwner,
  roleOptions,
  onRoleChange,
  onRemove,
  onResend,
  onRevoke,
}: {
  member: PlatformProjectMember;
  pending?: boolean;
  canManage: boolean;
  isLastOwner: boolean;
  roleOptions: SelectControlOption[];
  onRoleChange: (memberId: string, role: string) => Promise<void>;
  onRemove: (member: PlatformProjectMember) => Promise<void>;
  onResend: (member: PlatformProjectMember) => Promise<void>;
  onRevoke: (member: PlatformProjectMember) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const displayName = member.displayName || member.username;
  const disabled = !canManage || isLastOwner;
  const hint = isLastOwner
    ? t("projectShell.membersUi.lastOwnerRemoveHint")
    : t("projectShell.membersUi.errors.removeReadonly");
  const actionsLabel = t("projectShell.membersUi.actionsFor", { username: member.username });
  const date = pending ? member.invitedAt : member.joinedAt;

  return (
    <div data-testid="project-member-card" className="flex min-w-0 max-w-full items-center justify-between gap-3 py-1">
      <div
        className="flex min-w-0 items-center gap-3"
        title={date ? formatMemberDate(date, i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "zh-CN", t) : undefined}
      >
        <div className="relative w-fit shrink-0">
          <Avatar className={cn("size-9.5", pending && "border-primary border border-dashed")}>
            {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={t("projectShell.membersUi.avatar", { name: displayName })} />}
            <AvatarFallback>{memberInitials(member)}</AvatarFallback>
          </Avatar>
          {member.role === "owner" && !pending && (
            <span className="absolute -top-1.5 -right-1.5" aria-label={t("projectShell.membersUi.roles.owner")}>
              <BadgeCheck className="text-background size-5 fill-sky-500" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col items-start max-sm:max-w-30">
          <p className="w-full truncate text-sm font-medium" title={displayName}>{displayName}</p>
          <p className="text-muted-foreground w-full truncate text-xs" title={member.username}>{member.username}</p>
          {member.status === "expired" && <Badge variant="destructive">{memberStatusLabel(member.status, t)}</Badge>}
        </div>
      </div>
      <div className={cn("flex shrink-0 items-center gap-2", disabled && "cursor-not-allowed opacity-60")}>
        <SelectControl
          aria-label={t("projectShell.membersUi.memberRole", { username: member.username })}
          value={member.role}
          onValueChange={(role) => void onRoleChange(member.id, role)}
          disabled={disabled}
          className="w-30 px-2 py-1 max-sm:w-20"
          options={roleOptions}
        />
        {disabled ? (
          <Tooltip>
            <TooltipTrigger render={<span tabIndex={0} aria-label={hint} className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />}>
              <Button variant="ghost" size="icon" className="rounded-full" disabled aria-label={actionsLabel}>
                <EllipsisVertical aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{hint}</TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" aria-label={actionsLabel} />}>
              <EllipsisVertical aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {pending ? (
                <>
                  <DropdownMenuItem onClick={() => void onResend(member)} aria-label={t("projectShell.membersUi.resendFor", { username: member.username })}>
                    {t("projectShell.membersUi.resend")}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => void onRevoke(member)} aria-label={t("projectShell.membersUi.revokeFor", { username: member.username })}>
                    {t("projectShell.membersUi.revoke")}
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem variant="destructive" onClick={() => void onRemove(member)} aria-label={t("projectShell.membersUi.removeFor", { username: member.username })}>
                  {t("projectShell.membersUi.remove")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
