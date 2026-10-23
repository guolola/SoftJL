// Verifies that standalone workspace metadata excludes the retired exam entry.
import { describe, expect, it } from "vitest";
import {
  SHELL_ROUTE_MODULES,
} from "./modules";

describe("workspaceModules", () => {
  it("keeps standalone route metadata discoverable", () => {
    expect(SHELL_ROUTE_MODULES.map((module) => module.route)).toEqual([
      "/workspace",
    ]);
    expect(SHELL_ROUTE_MODULES[0].label).toBe("工作台");
  });
});
