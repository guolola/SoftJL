// Shares browser query parsing and localized auth API messages for auth entry pages.
export function getQueryParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

export function getSafeRedirectPath() {
  const redirect = getQueryParam("redirect");
  if (redirect.startsWith("/") && !redirect.startsWith("//")) {
    return redirect;
  }
  return "/dashboard";
}

export type LoginRedirectReason =
  | "login-required"
  | "session-expired"
  | "session-check-failed";

export function buildLoginRedirectPath(
  redirect: string,
  reason: LoginRedirectReason,
) {
  const safeRedirect = redirect.startsWith("/") && !redirect.startsWith("//")
    ? redirect
    : "/dashboard";
  const search = new URLSearchParams({ redirect: safeRedirect, reason });
  return `/login?${search.toString()}`;
}

export function localizeAuthMessage(message: string) {
  if (message.includes("Invalid email or password")) return "邮箱或用户名或密码错误。";
  if (message.includes("Email or username is already registered")) return "邮箱或用户名已被注册。";
  if (message.includes("Email verification is required")) return "登录前需要先完成邮箱验证。";
  if (message.includes("Email verification token is invalid or expired")) return "邮箱已验证或链接已失效，请直接登录。";
  if (message.includes("Log in to accept this project invitation")) return "请先登录后接受项目邀请。";
  if (message.includes("Project invitation token is invalid or expired")) return "邀请链接无效或已过期。";
  if (message.includes("Project invitation is for a different email address")) return "当前登录账号不是被邀请邮箱，请切换账号后再接受邀请。";
  if (message.includes("Reset email sent")) return "重置邮件已发送。";
  if (message.includes("Password reset")) return "密码已重置。";
  return message;
}
