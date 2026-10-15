import { describe, expect, it } from "vitest";

import { matchAppRoute } from "./app-routes";

describe("matchAppRoute dashboard", () => {
  it.each(["lineage", "history", "settings", "members", "documents"])("matches the project %s page", section => {
    expect(matchAppRoute(`/projects/project%20one/${section}`)).toEqual({
      kind: "project-workspace", path: `/projects/project%20one/${section}`, projectId: "project one", section,
    });
  });
  it("matches documentation as an independent public route", () => {
    expect(matchAppRoute("/tutorial")).toEqual({ kind: "product-docs", path: "/tutorial" });
  });
  it("rejects excluded connections before interpreting a project ID", () => {
    expect(matchAppRoute("/projects/connections")).toEqual({ kind: "not-found", path: "/projects/connections" });
    expect(matchAppRoute("/account/connections")).toEqual({ kind: "not-found", path: "/account/connections" });
  });
  it("matches the platform dashboard route", () => {
    expect(matchAppRoute("/dashboard")).toEqual({ kind: "dashboard", path: "/dashboard" });
  });

  it("does not capture project paths", () => {
    expect(matchAppRoute("/projects").kind).toBe("projects-index");
  });
});
