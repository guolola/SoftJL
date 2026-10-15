// Shares route path type contracts with features without coupling them to app route matching.
export type ShellRoutePath = "/workspace";

export type AuthRoutePath =
  | "/login"
  | "/register"
  | "/verify-email"
  | "/forgot-password"
  | "/reset-password";

export type MarketingRoutePath = "/";
export type ProjectRouteSection = "lineage" | "settings" | "members" | "history" | "documents";

export type AppRoute =
  | { kind: "mcp-connections"; path: "/projects/connections" | "/account/connections" }
  | { kind: "marketing-home"; path: MarketingRoutePath }
  | { kind: "shell"; path: ShellRoutePath }
  | { kind: "auth"; path: AuthRoutePath }
  | { kind: "invitation-accept"; path: "/invitations/accept" }
  | { kind: "not-found"; path: string }
  | { kind: "legacy-account"; path: "/account" | "/account/security" }
  | { kind: "legacy-redirect"; path: "/settings/models"; to: "/projects" }
  | { kind: "dashboard"; path: "/dashboard" }
  | { kind: "projects-index"; path: "/projects" }
  | { kind: "projects-new"; path: "/projects/new" }
  | {
      kind: "project-workspace";
      path: string;
      projectId: string;
      section?: ProjectRouteSection;
    };
