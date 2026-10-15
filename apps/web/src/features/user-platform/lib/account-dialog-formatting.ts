// Formats account dialog labels, dates, and usage summaries without owning UI state.
import { formatSessionDevice } from "./session-device";
import type {
  PlatformLoginEvent,
  PlatformUser,
} from "../services/platform-api";

export const AVATAR_FILE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const ACCOUNT_SESSION_RECORD_LIMIT = 5;

export function initials(user: PlatformUser | null) {
  const label = user?.displayName || user?.email || "登录";
  return label.trim().slice(0, 1).toUpperCase();
}

export function formatDate(value: string | null | undefined, locale = "zh-CN", empty = "暂无") {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function accountStatusLabel(
  status: string | null | undefined,
  labels = { active: "正常", disabled: "已停用", pending: "待激活", unknown: "未知" },
) {
  switch (status) {
    case "active":
      return labels.active;
    case "disabled":
      return labels.disabled;
    case "pending":
      return labels.pending;
    default:
      return status || labels.unknown;
  }
}

export function loginOutcomeLabel(
  outcome: PlatformLoginEvent["outcome"],
  labels = { success: "成功", failed: "失败" },
) {
  return outcome === "success" ? labels.success : labels.failed;
}

export function loginDetail(event: PlatformLoginEvent, noDetails = "暂无详情", unknownDevice = "未知设备") {
  return event.message || (event.userAgent ? formatSessionDevice(event.userAgent, unknownDevice) : noDetails);
}
