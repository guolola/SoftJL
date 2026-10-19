// Covers the off-screen full-width tour regression and narrow or short viewports.
import { describe, expect, it } from "vitest";
import { tourCardPosition } from "./tour-card-position";

describe("tour card positioning", () => {
  it.each([[1440, 900], [1920, 1080], [375, 667], [320, 240]])("keeps controls visible at %d x %d", (width, height) => {
    const card = { width: Math.min(336, width - 32), height: Math.min(280, height - 32) };
    for (const side of ["left", "right", "top", "bottom"]) {
      const position = tourCardPosition({ left: 20, right: width - 20, top: 60, bottom: height - 10 }, card, { width, height }, side);
      expect(position.left).toBeGreaterThanOrEqual(16);
      expect(position.top).toBeGreaterThanOrEqual(16);
      expect(position.left + card.width).toBeLessThanOrEqual(width - 16);
      expect(position.top + card.height).toBeLessThanOrEqual(height - 16);
    }
  });
});
