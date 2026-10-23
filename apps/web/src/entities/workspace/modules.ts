// Defines workspace module contracts used by app composition and workspace feature navigation.

export type { ShellRoutePath } from "../../shared/lib/app-route-types";

export const SHELL_ROUTE_MODULES = [
  {
    label: "工作台",
    route: "/workspace" as const,
    description: "进入 SoftJL 工作区。",
  },
];
