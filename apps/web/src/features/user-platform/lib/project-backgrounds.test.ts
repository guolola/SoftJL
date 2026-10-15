// Verifies deterministic project background matching and fallback behavior.
import { describe, expect, it } from "vitest";
import {
  PROJECT_BACKGROUND_OPTIONS,
  fallbackProjectBackground,
  matchProjectBackground,
  resolveProjectBackground,
} from "./project-backgrounds";

describe("project backgrounds", () => {
  it("matches common business system keywords from project titles", () => {
    expect(matchProjectBackground("ERP 企业资源计划实验")?.key).toBe("erp");
    expect(matchProjectBackground("CRM 客户关系管理平台")?.key).toBe("crm");
    expect(matchProjectBackground("座位预约预订系统")?.key).toBe("booking");
    expect(matchProjectBackground("质量追溯系统 UML 项目")?.key).toBe("quality_traceability");
  });

  it("uses a personal-site-safe PLM label while preserving legacy keyword matching", () => {
    expect(PROJECT_BACKGROUND_OPTIONS.find((background) => background.key === "plm")?.label).toBe(
      "PLM 全生命周期管理",
    );
    expect(matchProjectBackground("产品生命周期管理平台")?.key).toBe("plm");
  });

  it("prefers saved manual backgrounds before title matching", () => {
    expect(
      resolveProjectBackground({
        id: "project-a",
        name: "CRM 客户系统",
        backgroundKey: "booking",
      }).key,
    ).toBe("booking");
  });

  it("uses stable fallback backgrounds for unmatched titles", () => {
    expect(fallbackProjectBackground("project-a:课程 UML 实验项目").key).toBe(
      fallbackProjectBackground("project-a:课程 UML 实验项目").key,
    );
    expect(resolveProjectBackground({ id: "project-a", name: "课程 UML 实验项目" }).imageUrl).toBeTruthy();
    expect(PROJECT_BACKGROUND_OPTIONS.every((background) => typeof background.imageUrl === "string")).toBe(true);
  });
});
