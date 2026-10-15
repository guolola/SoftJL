// Verifies generation notifications do not duplicate the stage result dialog.
import { describe, expect, it, vi } from "vitest";
import {
  GENERATION_COMPLETED_EVENT,
  notifyGenerationCompleted,
  notifyGenerationResultStale,
  notifyGenerationStarted,
} from "./notifications";

const { toastMessage } = vi.hoisted(() => ({
  toastMessage: vi.fn(),
}));

vi.mock("../../../shared/ui/floating-alert", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/ui/floating-alert")>();
  return { ...actual, floatingAlert: {
    ...actual.floatingAlert,
    message: toastMessage,
  } };
});

describe("workspace generation notifications", () => {
  it("keeps generation start silent for all stages", () => {
    toastMessage.mockClear();

    notifyGenerationStarted("requirements");
    notifyGenerationStarted("design");
    notifyGenerationStarted("code");
    notifyGenerationStarted("document", "requirementsSpec");
    notifyGenerationStarted("document", "softwareDesignSpec");

    expect(toastMessage).not.toHaveBeenCalled();
  });

  it("still emits completion events for sidebar expansion without toast", () => {
    toastMessage.mockClear();
    const listener = vi.fn();
    window.addEventListener(GENERATION_COMPLETED_EVENT, listener);

    try {
      notifyGenerationCompleted("requirements");
      notifyGenerationCompleted("design");
    } finally {
      window.removeEventListener(GENERATION_COMPLETED_EVENT, listener);
    }

    expect(listener).toHaveBeenCalledTimes(2);
    expect(toastMessage).not.toHaveBeenCalled();
  });

  it("keeps stale-result hints as a lightweight toast", () => {
    toastMessage.mockClear();

    notifyGenerationResultStale();

    expect(toastMessage).toHaveBeenCalledWith(
      "结果基于生成开始时的内容，期间修改不会自动合并到本次结果",
    );
  });
});
