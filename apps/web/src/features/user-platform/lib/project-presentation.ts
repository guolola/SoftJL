// Maps platform project API records into project-list presentation data.
import type {
  PlatformProject,
  PlatformProjectMemberPreview,
  PlatformUser,
} from "../services/platform-api";
import {
  resolveProjectBackground,
  type ProjectBackgroundOption,
} from "./project-backgrounds";

export type StaticProject = {
  id: string;
  name: string;
  description: string;
  owner: string;
  ownerUserId: string;
  isOwnedByCurrentUser: boolean;
  visibilityKind: PlatformProject["visibility"];
  visibility: string;
  status: string;
  statusLabel: string;
  updatedAt: string;
  updatedAtDisplay: string;
  lastGeneratedAt: string;
  searchableText: string;
  memberCount: number;
  members: StaticProjectMemberPreview[];
  recentRun: string;
  background: ProjectBackgroundOption;
};

type StaticProjectMemberPreview = {
  id: string;
  label: string;
  initial: string;
  avatarUrl: string | null;
  role: string;
  status: string;
};

export const PROJECT_SCOPE_OPTIONS = [
  { value: "all", labelKey: "projects.scope.all", shortLabelKey: "projects.scopeShort.all" },
  { value: "mine", labelKey: "projects.scope.mine", shortLabelKey: "projects.scopeShort.mine" },
  { value: "team", labelKey: "projects.scope.team", shortLabelKey: "projects.scopeShort.team" },
  { value: "archived", labelKey: "projects.scope.archived", shortLabelKey: "projects.scopeShort.archived" },
] as const;

function displayNameFromUser(user: PlatformUser | null | undefined) {
  return user?.displayName?.trim() || user?.email?.split("@")[0] || user?.id || "";
}

function compactOwnerLabel(ownerUserId: string) {
  const normalized = ownerUserId.trim();
  if (!normalized) return "未知用户";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) {
    return `用户 ${normalized.slice(0, 8)}`;
  }
  return normalized;
}

function ownerNameFromProject(project: PlatformProject, currentUser: PlatformUser | null) {
  const ownerPreview = project.memberPreviews?.find((member) => member.userId === project.ownerUserId);
  const ownerDisplayName = project.ownerDisplayName?.trim() || ownerPreview?.displayName?.trim();
  if (ownerDisplayName) return ownerDisplayName;
  if (currentUser?.id === project.ownerUserId) {
    return displayNameFromUser(currentUser) || "当前用户";
  }
  return compactOwnerLabel(project.ownerUserId);
}

function ownerInitial(owner: string) {
  return Array.from(owner.trim())[0]?.toUpperCase() || "U";
}

function memberPreviewLabel(member: PlatformProjectMemberPreview) {
  return member.displayName?.trim() || (member.userId ? compactOwnerLabel(member.userId) : "未知成员");
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function formatProjectDateTimeMinute(value: string, locale = "zh-CN") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return locale === "en" ? "Unknown" : "未知";
  if (locale === "en") {
    return new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
  return [date.getFullYear(), padDatePart(date.getMonth() + 1), padDatePart(date.getDate())].join("-") +
    ` ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function projectMemberPreviewsFromApi(
  project: PlatformProject,
  ownerName: string,
): StaticProjectMemberPreview[] {
  const previews = project.memberPreviews ?? [];
  if (previews.length === 0) {
    return [
      {
        id: `${project.id}:owner`,
        label: ownerName,
        initial: ownerInitial(ownerName),
        avatarUrl: project.ownerAvatarUrl ?? null,
        role: "owner",
        status: "active",
      },
    ];
  }

  return previews.map((member) => {
    const label = memberPreviewLabel(member);
    return {
      id: member.id,
      label,
      initial: ownerInitial(label),
      avatarUrl: member.avatarUrl ?? null,
      role: member.role,
      status: member.status,
    };
  });
}

function projectVisibilityLabel(visibility: PlatformProject["visibility"], locale: string) {
  if (locale === "en") {
    if (visibility === "private") return "Members only";
    if (visibility === "team") return "Team visible";
    return "Public";
  }
  if (visibility === "private") return "仅成员可见";
  if (visibility === "team") return "团队成员可见";
  return "公开可见";
}

function projectStatusLabel(status: string, locale: string) {
  if (locale === "en") {
    if (status === "archived") return "Archived";
    if (status === "active") return "Active";
    return status;
  }
  if (status === "archived") return "已归档";
  if (status === "active") return "进行中";
  return status;
}

export function projectFromApi(
  project: PlatformProject,
  currentUser: PlatformUser | null = null,
  locale = "zh-CN",
  noDescription = "暂无项目描述。",
): StaticProject {
  const memberCount = Math.max(project.memberCount ?? 1, 1);
  const ownerName = ownerNameFromProject(project, currentUser);
  const members = projectMemberPreviewsFromApi(project, ownerName);
  const background = resolveProjectBackground({
    id: project.id,
    name: project.name,
    backgroundKey: project.backgroundKey ?? null,
  });
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? noDescription,
    owner: ownerName,
    ownerUserId: project.ownerUserId,
    isOwnedByCurrentUser: currentUser?.id === project.ownerUserId,
    visibilityKind: project.visibility,
    visibility: projectVisibilityLabel(project.visibility, locale),
    status: project.status,
    statusLabel: projectStatusLabel(project.status, locale),
    updatedAt: new Date(project.updatedAt).toLocaleString(locale),
    updatedAtDisplay: formatProjectDateTimeMinute(project.updatedAt, locale),
    lastGeneratedAt: project.lastGeneratedAt ?? "",
    searchableText: [
      project.name,
      project.description,
      project.status,
      project.visibility,
      project.ownerUserId,
      ownerName,
      ...members.map((member) => member.label),
      project.courseLabel,
      project.classLabel,
      project.teamLabel,
      background.label,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    memberCount,
    members,
    background,
    recentRun: project.lastGeneratedAt
      ? new Date(project.lastGeneratedAt).toLocaleString(locale)
      : locale === "en"
        ? "Waiting for first generation"
        : "等待首次生成",
  };
}
