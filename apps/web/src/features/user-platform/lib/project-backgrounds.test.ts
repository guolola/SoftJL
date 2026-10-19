// Covers manual background resolution and the absence of implicit selections.
import { describe, expect, it, vi } from "vitest";
import type { ProjectBackgroundKey } from "@uml-platform/contracts";
import { PROJECT_BACKGROUND_OPTIONS, randomProjectBackground, resolveProjectBackground } from "./project-backgrounds";

describe("project backgrounds", () => {
  it("leaves unset backgrounds empty instead of selecting a business image", () => {
    expect(resolveProjectBackground()).toBeNull();
    expect(resolveProjectBackground(null)).toBeNull();
  });

  it("retains stored manual selections using the current keys", () => {
    expect(resolveProjectBackground("booking")?.imageUrl).toContain("cover-19");
    expect(resolveProjectBackground("quality_traceability")?.imageUrl).toContain("cover-20");
    expect(resolveProjectBackground("booking")).toBe(resolveProjectBackground("booking"));
  });

  it("provides twenty-one unnamed WebP options", () => {
    expect(PROJECT_BACKGROUND_OPTIONS).toHaveLength(21);
    expect(new Set(PROJECT_BACKGROUND_OPTIONS.map(({ key }) => key)).size).toBe(21);
    expect(PROJECT_BACKGROUND_OPTIONS.every(({ imageUrl }) => imageUrl.includes(".webp"))).toBe(true);
    expect(PROJECT_BACKGROUND_OPTIONS.every((background) => !("label" in background) && !("aliases" in background))).toBe(true);
  });

  it("can sample both ends of the gallery for a new project", () => {
    const random = vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0.999999);
    try {
      expect(randomProjectBackground()).toBe(PROJECT_BACKGROUND_OPTIONS[0]);
      expect(randomProjectBackground()).toBe(PROJECT_BACKGROUND_OPTIONS[20]);
    } finally {
      random.mockRestore();
    }
  });

  it("rejects invalid stored keys instead of fabricating a background", () => {
    expect(() => resolveProjectBackground("obsolete" as ProjectBackgroundKey)).toThrow("Unknown project background key");
  });
});
