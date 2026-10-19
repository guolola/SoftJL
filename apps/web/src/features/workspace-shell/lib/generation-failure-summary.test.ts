// Covers concise failure categories and preserves actionable input errors without raw diagnostics.
import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "../../../shared/i18n";
import { generationFailureSummary } from "./generation-failure-summary";

afterEach(async () => { await i18n.changeLanguage("zh-CN"); });

describe("generation failure summary", () => {
  it.each([
    [{ code: "RUN_RENDER_FAILED", message: "SVG 关系 cf04 的标签与模型不一致" }, "绘图器故障，请重试。"],
    ["Error: 绘图器故障：重建后仍未通过绘制校验：" + "预期标签与实际不同；".repeat(1000), "绘图器故障，请重试。"],
    [{ category: "render", message: "timeout" }, "绘图器故障，请重试。"],
    [{ code: "RUN_STRUCTURED_OUTPUT_INVALID", message: "traceability 缺失" }, "生成结果格式错误，请重试。"],
    ["模型请求超时：" + "诊断".repeat(1000), "生成超时，请重试。"],
    [{ code: "RUN_INTERNAL_ERROR", message: "private payload" }, "生成失败，请重试。"],
    [undefined, "生成失败，请重试。"],
  ])("summarizes %j", (error, expected) => {
    expect(generationFailureSummary(error)).toBe(expected);
  });

  it("retains translated prerequisite guidance instead of provider details", () => {
    expect(generationFailureSummary({ code: "RUN_DEPENDENCY_MISSING", message: "private payload" }))
      .toBe(i18n.t("errors.codes.RUN_DEPENDENCY_MISSING"));
  });

  it("uses the selected language", async () => {
    await i18n.changeLanguage("en-US");
    expect(generationFailureSummary({ code: "RUN_RENDER_FAILED" }, "Activity diagram")).toBe("Activity diagram: Diagram renderer failed. Please retry.");
  });
});
