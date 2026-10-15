// Verifies authentication redirects preserve safe in-app destinations without allowing external redirects.
import { describe, expect, it } from "vitest";

import { buildLoginRedirectPath, getSafeRedirectPath } from "./auth-page-routing";

describe("auth page routing", () => {
  it("builds a login route that preserves the protected destination and reason", () => {
    expect(buildLoginRedirectPath("/projects/library-booking?account=profile", "session-expired"))
      .toBe("/login?redirect=%2Fprojects%2Flibrary-booking%3Faccount%3Dprofile&reason=session-expired");
  });

  it("rejects protocol-relative redirects", () => {
    window.history.pushState({}, "", "/login?redirect=%2F%2Fevil.example");

    expect(getSafeRedirectPath()).toBe("/dashboard");
    expect(buildLoginRedirectPath("//evil.example", "login-required"))
      .toBe("/login?redirect=%2Fdashboard&reason=login-required");
  });
});
