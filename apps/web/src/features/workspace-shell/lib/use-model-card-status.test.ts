// Covers artifact availability, stale state and retained-output failures in card/session integration.
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceRecord } from "../../../test/workspace-test-utils";
import type { GenerationTask } from "../../workspace-session/model/session-state";
import { useModelCardStatus } from "./use-model-card-status";

const mock = vi.hoisted(() => ({ session: {} as Record<string, unknown> }));
vi.mock("../../workspace-session/state", () => ({ useWorkspaceSession: () => mock.session }));

beforeEach(() => {
  mock.session = {
    ...createWorkspaceRecord(), generatedDiagrams: [], generatedDesignDiagrams: [],
    staleDiagrams: [], staleDesignDiagrams: [], staleDesignModelIds: [], generationTasks: [] as GenerationTask[],
  };
});

describe("useModelCardStatus", () => {
  it("does not mark a structured model without SVG as successful", () => {
    mock.session.models = { class: { diagramKind: "class", classes: [], relationships: [] } };
    mock.session.generatedDiagrams = ["class"];
    expect(renderHook(useModelCardStatus).result.current.requirementStatusFor("class")).toBe("missing");
  });
  it("shows persisted failure before an older successful SVG", () => {
    mock.session.svgArtifacts = { class: { svg: "<svg/>" } };
    mock.session.diagramErrors = { class: { error: { message: "重试失败" } } };
    mock.session.designSvgArtifacts = { class: { svg: "<svg/>" } };
    mock.session.designDiagramErrors = { class: { error: { message: "重试失败" } } };
    const { result } = renderHook(useModelCardStatus);
    expect(result.current.requirementStatusFor("class")).toBe("failed");
    expect(result.current.designStatusFor("class")).toBe("failed");
  });
  it("distinguishes a current SVG from an outdated one", () => {
    mock.session.svgArtifacts = { class: { svg: "<svg/>" } };
    mock.session.designSvgArtifacts = { class: { svg: "<svg/>" } };
    mock.session.staleDesignDiagrams = ["class"];
    const { result } = renderHook(useModelCardStatus);
    expect(result.current.requirementStatusFor("class")).toBe("completed");
    expect(result.current.designStatusFor("class")).toBe("stale");
  });
});
