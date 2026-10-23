import { standardModelFixture } from "@uml-platform/contracts/testing";
// Exercises the actual API wrapper so browser JSON requests cannot silently become text/plain.
import { createStandardProjectState, standardDiagramKinds, type StandardModel } from "@uml-platform/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { patchUserSettings } from "../../../shared/lib/user-settings";
import { standardApi } from "./standard-api";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function captureRequests(state: unknown = createStandardProjectState()) {
  const requests: Request[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    requests.push(new Request(new URL(url, "http://localhost"), init));
    return new Response(JSON.stringify({ state }), {
      headers: { "Content-Type": "application/json" },
    });
  }));
  return requests;
}

it("submits requirements and follow-up messages as JSON with the selected model", async () => {
  const requests = captureRequests();
  patchUserSettings({ providerConfigId: "provider-test", providerModelOptions: ["deepseek-v4.1-flash"], defaultModel: "deepseek-v4.1-flash" });
  for (const message of ["图书借阅系统，学生可以借书。", "再增加管理员审核借阅申请。"] ) {
    await standardApi.start("project-test", { operation: "chat", message });
    const request = requests.at(-1)!;
    expect(request.method).toBe("POST");
    expect(request.headers.get("Content-Type")).toBe("application/json");
    expect(request.credentials).toBe("include");
    expect(await request.json()).toEqual({ operation: "chat", message, providerSettings: { providerConfigId: "provider-test", model: "deepseek-v4.1-flash" } });
  }
});

it("declares JSON for saving requirements and diagrams", async () => {
  const requests = captureRequests();
  const model: StandardModel = standardModelFixture("class");
  await standardApi.saveDescription("project-test", "更新后的需求");
  await standardApi.saveModel("project-test", "diagram-test", model);
  expect(requests.map(request => request.method)).toEqual(["PATCH", "PUT"]);
  for (const request of requests) expect(request.headers.get("Content-Type")).toBe("application/json");
  expect(await requests[0].json()).toEqual({ description: "更新后的需求" });
  expect(await requests[1].json()).toEqual(model);
});

it("leaves bodyless cancel actions without a JSON content type", async () => {
  const requests = captureRequests();
  await standardApi.cancel("project-test");
  for (const request of requests) {
    expect(request.method).toBe("POST");
    expect(request.headers.has("Content-Type")).toBe(false);
    expect(await request.text()).toBe("");
  }
});

it.each(standardDiagramKinds)("%s saves and reads the current contract without a generic adapter", async kind => {
  const model = standardModelFixture(kind);
  const state = { ...createStandardProjectState(), diagrams: { [kind]: { id: kind, kind, title: kind, status: "completed", model } } };
  const requests = captureRequests(state);
  const saved = await standardApi.saveModel("p", kind, model);
  expect(await requests[0].json()).toEqual(model);
  expect(saved.state.diagrams[kind].model).toEqual(model);
  expect((await standardApi.read("p")).state.diagrams[kind].model).toEqual(model);
});

it("rejects obsolete outgoing models before sending a request", () => {
  const requests = captureRequests();
  expect(() => standardApi.saveModel("p", "class", { nodes: [], edges: [] } as unknown as StandardModel)).toThrow();
  expect(requests).toHaveLength(0);
});

it("rejects obsolete model responses instead of constructing editable state", async () => {
  captureRequests({ ...createStandardProjectState(), diagrams: { class: { id: "class", kind: "class", title: "旧模型", status: "completed", model: { nodes: [], edges: [] } } } });
  await expect(standardApi.read("p")).rejects.toThrow();
});
