// Verifies bulk selection removes blocked upstreams and their newly unavailable dependents.
import { describe, expect, it } from "vitest";
import { selectableDesignTargets } from "./design-target-selection";

describe("selectableDesignTargets", () => {
  it("prunes dependent targets again after removing an unavailable upstream", () => {
    const selected = selectableDesignTargets(["class", "component", "deployment", "navigation"], (target, batch) => {
      if (target === "class") return "缺少来源";
      if (target === "component" && !batch.includes("class")) return "缺少设计类图";
      if (target === "deployment" && !batch.includes("component")) return "缺少组件关系图";
      return null;
    });
    expect(selected).toEqual(["navigation"]);
  });

  it("retains an available upstream with its dependents in the same batch", () => {
    expect(selectableDesignTargets(["class", "table"], (target, batch) =>
      target === "table" && !batch.includes("class") ? "缺少设计类图" : null,
    )).toEqual(["class", "table"]);
  });
});
