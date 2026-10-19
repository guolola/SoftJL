// Verifies persisted run failures use localized guidance instead of technical payloads.
import { afterEach, expect, it } from "vitest";
import { i18n } from "./i18n";
import { localizeRunFailure } from "./api-errors";

afterEach(async () => { await i18n.changeLanguage("zh-CN"); });

it.each([
  { code: "PLATFORM_PROVIDER_UNAVAILABLE", message: "private provider response" },
])("localizes structured run failures: %j", (error) => {
  expect(localizeRunFailure(error, "生成失败，请重试。"))
    .toBe("当前模型服务暂不可用，请稍后重试。");
});

it.each(["PLATFORM_PROVIDER_UNAVAILABLE: private provider response", "generate_design_sequence · PLATFORM_PROVIDER_UNAVAILABLE · private provider response", "unknown_internal_stage: SQL stack trace", { code: "FUTURE_ERROR_CODE", message: "private payload" }])("uses safe guidance for an unknown failure", (error) => {
  expect(localizeRunFailure(error, "生成失败，请重试。"))
    .toBe("生成失败，请重试。");
});

it("uses the current language for structured failures", async () => {
  await i18n.changeLanguage("en-US");
  expect(localizeRunFailure({ code: "PLATFORM_PROVIDER_UNAVAILABLE", message: "private payload" }, "Failed."))
    .toBe("The model service is temporarily unavailable. Try again later.");
});
