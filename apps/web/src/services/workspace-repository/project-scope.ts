// Normalizes project route scope and attaches project headers to workspace API requests.
export const PROJECT_ID_HEADER = "X-UML-Project-Id";
export const PROJECT_REQUIRED_MESSAGE = "请先登录并进入项目";

export function normalizeProjectId(projectId?: string | null) {
  const normalized = projectId?.trim();
  return normalized ? normalized : null;
}

export function getProjectIdFromPath(pathname: string) {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function projectHeaders(projectId: string | null) {
  return projectId ? { [PROJECT_ID_HEADER]: projectId } : {};
}

export function requireProjectScope(projectId: string | null) {
  if (!projectId) throw new Error(PROJECT_REQUIRED_MESSAGE);
  return projectId;
}

export function withProjectHeaders<
  T extends RequestInit & {
    errorKey?: string;
    errorMessage?: string;
    defaultFileName?: string;
  },
>(projectId: string | null, options: T): T {
  return {
    ...options,
    headers: {
      ...projectHeaders(projectId),
      ...options.headers,
    },
  } as T;
}
