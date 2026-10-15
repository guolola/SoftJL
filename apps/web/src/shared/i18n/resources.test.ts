// Guards against shipping a locale with silently missing platform copy.
import { describe, expect, it } from "vitest";
import { resources } from "./resources";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("i18n resources", () => {
  it("keeps Chinese and English translation keys identical", () => {
    const chinese = leafKeys(resources["zh-CN"].translation).sort();
    const english = leafKeys(resources.en.translation).sort();
    expect(english).toEqual(chinese);
  });
});
