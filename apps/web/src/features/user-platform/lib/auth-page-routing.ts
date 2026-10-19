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
  return "/projects";
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
    : "/projects";
  const search = new URLSearchParams({ redirect: safeRedirect, reason });
  return `/login?${search.toString()}`;
}
