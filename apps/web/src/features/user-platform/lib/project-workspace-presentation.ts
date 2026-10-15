// Formats project workspace member, run, and document records for page and drawer views.
import type {
  PlatformDocument,
  PlatformProjectInvitation,
  PlatformProjectMember,
  PlatformRunSummary,
} from "../services/platform-api";
import type { TFunction } from "i18next";

export function invitationToMember(
  projectId: string,
  invitation: PlatformProjectInvitation,
): PlatformProjectMember {
  return {
    id: invitation.id,
    projectId,
    userId: "",
    email: invitation.email,
    displayName: invitation.email,
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
  const label = member.displayName || member.email || "成员";
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

export function getProjectRunKind(run: PlatformRunSummary) {
  if (
    run.runKind === "requirements" ||
    run.runKind === "design" ||
    run.runKind === "document" ||
    run.runKind === "feasibility"
  ) {
    return run.runKind;
  }
  const normalized = (run.stage ?? "").toLowerCase();
  if (normalized.includes("document") || normalized.includes("docx")) return "document";
  if (normalized.includes("code") || normalized.includes("ui")) return "code";
  if (normalized.includes("design")) return "design";
  if (
    normalized.includes("generate_models") ||
    normalized.includes("requirement") ||
    normalized.includes("rule") ||
    normalized.includes("extract") ||
    normalized.includes("plantuml") ||
    normalized.includes("render_svg") ||
    normalized.includes("render_diagram")
  ) {
    return "requirements";
  }
  return "all";
}

export function getProjectRunStageLabel(run: PlatformRunSummary, t?: TFunction) {
  const label = (key: string, fallback: string) => t ? t(`generation.stages.${key}`) : fallback;
  const stage = run.stage;
  const normalized = (stage ?? "").toLowerCase();
  const runKind = getProjectRunKind(run);
  if (!normalized) return label("waiting", "等待开始");
  if (normalized.includes("generate_context")) return label("context", "生成系统环境图");
  if (normalized.includes("render_context")) return label("renderContext", "渲染系统环境图");
  if (normalized.includes("generate_implementation")) return label("implementation", "生成实现方案");
  if (
    runKind === "feasibility" &&
    (normalized === "completed" ||
      normalized === "failed" ||
      normalized === "cancelled" ||
      normalized === "interrupted")
  ) {
    return label("feasibility", "可行性分析");
  }
  if (normalized.includes("extract_rules")) return label("rules", "提取需求规则");
  if (normalized.includes("generate_models")) return label("requirementModels", "生成需求模型");
  if (normalized.includes("generate_tests")) return label("tests", "生成测试用例");
  if (normalized.includes("generate_design")) return label("designModels", "生成设计模型");
  if (normalized.includes("generate_plantuml")) {
    if (runKind === "design") return label("designPlantUml", "生成设计 PlantUML");
    if (runKind === "requirements") return label("requirementPlantUml", "生成需求 PlantUML");
    return label("plantUml", "生成 PlantUML");
  }
  if (normalized.includes("render_svg") || normalized.includes("render_diagram")) {
    if (runKind === "design") return label("designSvg", "渲染设计图表");
    if (runKind === "requirements") return label("requirementSvg", "渲染需求图表");
    return label("svg", "渲染图表");
  }
  if (normalized.includes("generate_document")) {
    if (run.documentKind === "requirementsSpec") return label("requirementsDocument", "生成需求规格说明书");
    if (run.documentKind === "feasibilityStudy") return label("feasibilityDocument", "生成可行性研究报告");
    if (run.documentKind === "softwareDesignSpec") return label("designDocument", "生成软件设计说明书");
    return label("documentText", "生成说明书正文");
  }
  if (normalized.includes("render_document")) {
    if (run.documentKind === "requirementsSpec") return label("requirementsFile", "生成需求规格说明书文件");
    if (run.documentKind === "feasibilityStudy") return label("feasibilityFile", "生成可行性研究报告文件");
    if (run.documentKind === "softwareDesignSpec") return label("designFile", "生成软件设计说明书文件");
    return label("documentFile", "生成说明书文件");
  }
  if (normalized.includes("queued")) return label("waiting", "等待开始");
  return stage ?? label("waiting", "等待开始");
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
    return member.displayName?.trim() || member.email?.trim() || `未知成员 ${shortIdentifier(operator)}`;
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
    member?.email,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function getProjectDocumentKindLabel(kind?: string | null, t?: TFunction) {
  if (kind === "requirementsSpec") return t ? t("projectShell.documentsUi.kinds.requirements") : "需求规格说明书";
  if (kind === "softwareDesignSpec") return t ? t("projectShell.documentsUi.kinds.design") : "软件设计说明书";
  return t ? t("projectShell.documentsUi.kinds.project") : "项目文档";
}

export function getProjectDocumentDisplayName(document: PlatformDocument, t?: TFunction) {
  const explicitName =
    document.fileName?.trim() ||
    document.name?.trim() ||
    document.title?.trim();
  if (explicitName) return explicitName;
  if (document.documentKind) {
    return `${getProjectDocumentKindLabel(document.documentKind, t)} v${document.version ?? 1}`;
  }
  return t ? t("projectShell.documentsUi.documentFallback", { id: shortIdentifier(document.id) }) : `文档 ${shortIdentifier(document.id)}`;
}

export function getProjectRunModelLabel(run: PlatformRunSummary) {
  return run.model?.trim() || "默认模型";
}

export function onlyOfficeStatusLabel(status?: string | null, t?: TFunction) {
  if (status === "editing") return t ? t("projectShell.documentsUi.officeStatus.editing") : "编辑中";
  if (status === "ready") return t ? t("projectShell.documentsUi.officeStatus.ready") : "可编辑";
  return t ? t("projectShell.documentsUi.officeStatus.unavailable") : "不可用";
}

export function downloadStatusLabel(status?: string | null, t?: TFunction) {
  if (status === "available") return t ? t("projectShell.documentsUi.downloadStatus.available") : "可用";
  if (status === "preparing") return t ? t("projectShell.documentsUi.downloadStatus.preparing") : "准备中";
  return t ? t("projectShell.documentsUi.downloadStatus.unavailable") : "不可用";
}
