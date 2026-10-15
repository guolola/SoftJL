// Verifies workspace module identity, ordering and route metadata at the entity boundary.
import { describe, expect, it } from "vitest";
import {
  SHELL_ROUTE_MODULES,
  WORKSPACE_MODULES,
  assertUniqueWorkspaceModules,
  findShellRouteModule,
} from "./modules";

describe("workspaceModules", () => {
  it("keeps module ids and route tabs unique", () => {
    expect(() => assertUniqueWorkspaceModules()).not.toThrow();
    expect(new Set(WORKSPACE_MODULES.map((module) => module.id)).size).toBe(
      WORKSPACE_MODULES.length,
    );
  });

  it("keeps testing after design without a code workspace", () => {
    expect(WORKSPACE_MODULES.map((module) => module.id)).toEqual([
      "system-requirements",
      "feasibility",
      "requirements",
      "diagrams",
      "design",
      
      "testing",
      "documents",
    ]);
  });

  it("keeps standalone route metadata discoverable", () => {
    expect(SHELL_ROUTE_MODULES.map((module) => module.route)).toEqual([
      "/workspace",
    ]);
    expect(findShellRouteModule("/workspace").label).toBe("工作台");
  });
});
