import type { AppRoute, AuthRoutePath, ProjectRouteSection, ShellRoutePath, } from "../shared/lib/app-route-types";
export type { AppRoute, AuthRoutePath, ProjectRouteSection, ShellRoutePath, } from "../shared/lib/app-route-types";
const SHELL_PATHS = new Set<ShellRoutePath>(["/workspace"]);
const AUTH_PATHS = new Set<AuthRoutePath>([
    "/login",
    "/register",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
]);
export function matchAppRoute(pathname: string): AppRoute {
    if (["/account/billing", "/billing/alipay/return"].includes(pathname))
        return { kind: "not-found", path: pathname };
    if (pathname === "/") {
        return { kind: "legacy-redirect", path: pathname, to: "/projects" };
    }
    if (SHELL_PATHS.has(pathname as ShellRoutePath)) {
        return { kind: "shell", path: pathname as ShellRoutePath };
    }
    if (AUTH_PATHS.has(pathname as AuthRoutePath)) {
        return { kind: "auth", path: pathname as AuthRoutePath };
    }
    if (pathname === "/invitations/accept") {
        return { kind: "invitation-accept", path: "/invitations/accept" };
    }
    if (pathname === "/account" || pathname === "/account/security") {
        return { kind: "legacy-account", path: pathname };
    }
    if (pathname === "/settings/models") {
        return { kind: "legacy-redirect", path: pathname, to: "/projects" };
    }
    if (pathname === "/dashboard")
        return { kind: "dashboard", path: "/dashboard" };
    if (pathname === "/projects")
        return { kind: "projects-index", path: "/projects" };
    if (pathname === "/projects/connections" || pathname === "/account/connections") return { kind: "mcp-connections", path: pathname };
    if (pathname === "/projects/new")
        return { kind: "projects-new", path: "/projects/new" };
    const projectMatch = pathname.match(/^\/projects\/([^/]+)(?:\/(lineage|settings|members|history|documents))?$/u);
    if (projectMatch) {
        const projectId = decodeURIComponent(projectMatch[1]);
        const section = projectMatch[2] as ProjectRouteSection | undefined;
        return section
            ? { kind: "project-workspace", path: pathname, projectId, section }
            : { kind: "project-workspace", path: pathname, projectId };
    }
    return { kind: "not-found", path: pathname };
}
