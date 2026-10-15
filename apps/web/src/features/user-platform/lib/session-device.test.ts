import { describe, expect, it } from "vitest";
import { formatSessionDevice } from "./session-device";

describe("formatSessionDevice", () => {
  it("formats recognizable desktop browsers", () => {
    expect(
      formatSessionDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      ),
    ).toBe("macOS • Chrome");

    expect(
      formatSessionDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
      ),
    ).toBe("Windows • Edge");
  });

  it("formats recognizable mobile browsers", () => {
    expect(
      formatSessionDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("iOS • Safari");
  });

  it("falls back for blank or unrecognized values", () => {
    expect(formatSessionDevice(null)).toBe("未知设备");
    expect(formatSessionDevice("   ")).toBe("未知设备");
    expect(formatSessionDevice("not a user agent")).toBe("未知设备");
  });
});
