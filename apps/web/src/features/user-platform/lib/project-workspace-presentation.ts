// Formats project workspace member, run, and document records for page and drawer views.
import type { PlatformProjectInvitation, PlatformProjectMember, PlatformRunSummary } from "../services/platform-api";
import type { TFunction } from "i18next";

export function invitationToMember(
  projectId: string,
  invitation: PlatformProjectInvitation,
): PlatformProjectMember {
  return {
    id: invitation.id,
    projectId,
    userId: "",
    username: invitation.username,
    displayName: invitation.username,
    role: invitation.role,
    status: invitation.status,
    invitedAt: invitation.invitedAt ?? null,
    joinedAt: null,
  };
}

export function memberStatusLabel(status: string, t?: TFunction) {
  if (status === "active") return t ? t("projectShell.membersUi.status.active") : "已加入";
  if (status === "invited") return t ? t("projectShell.membersUi.status.invited") : "邀请中";
  if (status === "expired") return t ? t("projectShell.membersUi.status.expired") : "已过期";
  if (status === "revoked") return t ? t("projectShell.membersUi.status.revoked") : "已撤销";
  return status;
}

export function memberRoleLabel(role: string, t?: TFunction) {
  if (role === "owner") return t ? t("projectShell.membersUi.roles.owner") : "所有者";
  if (role === "editor") return t ? t("projectShell.membersUi.roles.editor") : "编辑者";
  if (role === "viewer") return t ? t("projectShell.membersUi.roles.viewer") : "查看者";
  return role;
}

export function memberInitials(member: PlatformProjectMember) {
  const label = member.displayName || member.username || "成员";
  const parts = label.split(/[\s._-]+/u).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

export function formatMemberDate(value: string | null | undefined, locale = "zh-CN", t?: TFunction) {
  if (!value) return t ? t("projectShell.membersUi.noTime") : "暂无时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(date);
}

export function formatDateTime(value: string, locale = "zh-CN") {
  return new Date(value).toLocaleString(locale);
}

export function getProjectRunStatusLabel(status?: string | null, t?: TFunction) {
  if (t) return t(`generation.status.${status && ["queued", "running", "completed", "failed", "cancelled", "interrupted"].includes(status) ? status : "unknown"}`);
  switch (status) {
    case "queued":
      return "排队中";
    case "running":
      return "运行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    case "interrupted":
      return "服务中断，可重试";
    default:
      return status ?? "未知状态";
  }
}

export function getProjectRunStatusClasses(status?: string | null) {
  // Semantic status tokens keep run states consistent with the AdminCN palette.
  switch (status) {
    case "completed":
      return {
        bar: "bg-success",
        badge: "border-success/30 bg-success/10 text-success",
      };
    case "interrupted":
      return {
        bar: "bg-warning",
        badge: "border-warning/30 bg-warning/10 text-warning",
      };
    case "failed":
      return {
        bar: "bg-destructive",
        badge: "border-destructive/30 bg-destructive/10 text-destructive",
      };
    case "cancelled":
      return {
        bar: "bg-muted-foreground/40",
        badge: "border-muted-foreground/20 bg-muted text-muted-foreground",
      };
    case "queued":
    case "running":
      return {
        bar: "bg-primary",
        badge: "border-primary/20 bg-primary/10 text-primary",
      };
    default:
      return {
        bar: "bg-muted-foreground/30",
        badge: "border-border bg-secondary text-secondary-foreground",
      };
  }
}

export function getProjectRunDisplayTime(run: PlatformRunSummary) {
  return run.updatedAt ?? run.completedAt ?? run.startedAt ?? run.createdAt ?? null;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function shortIdentifier(value: string) {
  return value.slice(0, 8);
}

export function getProjectRunOperatorLabel(
  run: PlatformRunSummary,
  members: PlatformProjectMember[] = [],
) {
  const operator = run.createdByUserId?.trim();
  if (!operator) return "未知成员";
  const member = members.find((item) => item.userId === operator);
  if (member) {
    return member.displayName?.trim() || member.username?.trim() || `未知成员 ${shortIdentifier(operator)}`;
  }
  if (isUuidLike(operator)) return `未知成员 ${shortIdentifier(operator)}`;
  return operator;
}

export function getProjectRunOperatorSearchText(
  run: PlatformRunSummary,
  members: PlatformProjectMember[] = [],
) {
  const operator = run.createdByUserId?.trim() ?? "";
  const member = members.find((item) => item.userId === operator);
  return [
    operator,
    getProjectRunOperatorLabel(run, members),
    member?.displayName,
    member?.username,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function getProjectRunModelLabel(run: PlatformRunSummary, t?: TFunction) {
  if (run.model === "offline-demo-fixed-artifacts") return t ? t("uxReview.demoData") : "演示数据";
  return run.model?.trim() || "默认模型";
}
