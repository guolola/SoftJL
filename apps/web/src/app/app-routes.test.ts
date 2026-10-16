import { describe, expect, it } from "vitest";

import { matchAppRoute } from "./app-routes";

describe("matchAppRoute dashboard", () => {
  it("sends the community entry to the project list", () => {
    expect(matchAppRoute("/")).toEqual({ kind: "legacy-redirect", path: "/", to: "/projects" });
  });
  it("does not expose the retired exam placeholder", () => {
    expect(matchAppRoute("/exam")).toEqual({ kind: "not-found", path: "/exam" });
  });
  it.each(["lineage", "history", "settings", "members", "documents"])("matches the project %s page", section => {
    expect(matchAppRoute(`/projects/project%20one/${section}`)).toEqual({
      kind: "project-workspace", path: `/projects/project%20one/${section}`, projectId: "project one", section,
    });
  });
  it("leaves retired tutorial routes to the server redirect", () => {
    expect(matchAppRoute("/tutorial")).toEqual({ kind: "not-found", path: "/tutorial" });
  });
  it("matches connections before interpreting a project ID", () => {
    expect(matchAppRoute("/projects/connections")).toEqual({ kind: "mcp-connections", path: "/projects/connections" });
    expect(matchAppRoute("/account/connections")).toEqual({ kind: "mcp-connections", path: "/account/connections" });
  });
  it("matches the platform dashboard route", () => {
    expect(matchAppRoute("/dashboard")).toEqual({ kind: "dashboard", path: "/dashboard" });
  });

  it("does not capture project paths", () => {
    expect(matchAppRoute("/projects").kind).toBe("projects-index");
  });
});
