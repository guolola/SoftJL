// Checks engineering composer payload boundaries and scoped run cancellation.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StandardAttachment } from "@uml-platform/contracts";
import { cancelRequirementRunRequest, startRequirementRunRequest, startDesignRunRequest, startDocumentRunRequest } from "./run-actions-api";
import type { StartRunInput, StartDesignRunInput, StartDocumentRunInput } from "./start-inputs";

afterEach(() => vi.unstubAllGlobals());

const attachment: StandardAttachment = { id: "doc-1", name: "requirements.txt", type: "document", contentType: "text/plain", text: "订单需求" };
const input: StartRunInput = {
  requirementText: "", selectedDiagrams: [], rules: [], contextModels: [], contextRequirementModelTraceability: [],
  providerSettings: { providerConfigId: "provider-1", model: "model-1" }, attachments: [attachment], reasoning: false,
};

describe("requirement composer API requests", () => {
  it("keeps source attachments exclusive to rule extraction and passes reasoning to model generation", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify({ runId: "run-1" }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await startRequirementRunRequest(input, "project-1");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ projectId: "project-1", requirementText: "", attachments: [attachment], reasoning: false });
    await startRequirementRunRequest({ ...input, selectedDiagrams: ["usecase"] }, "project-1");
    const modelBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(modelBody).not.toHaveProperty("requirementText");
    expect(modelBody).not.toHaveProperty("attachments");
    expect(modelBody.reasoning).toBe(false);
  });

  it.each([true, false])("passes an explicit reasoning choice to design and document requests: %s", async reasoning => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify({ runId: "run-1" }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await startDesignRunRequest({ providerSettings: input.providerSettings, selectedDiagrams: ["sequence"], reasoning } as StartDesignRunInput, "project-1");
    await startDocumentRunRequest({ providerSettings: input.providerSettings, documentKind: "requirementsSpec", useAiText: true, reasoning } as StartDocumentRunInput, "project-1");
    for (const call of fetchMock.mock.calls) expect(JSON.parse(String(call[1]?.body))).toMatchObject({ projectId: "project-1", reasoning });
  });

  it("cancels with the current project scope and encoded run id", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify({ status: "cancelled" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await cancelRequirementRunRequest("run/1", "project-1");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/projects/project-1/runs/run%2F1/cancel"), expect.objectContaining({ method: "POST", credentials: "include", headers: expect.objectContaining({ "X-UML-Project-Id": "project-1" }) }));
    await expect(cancelRequirementRunRequest("run-1", null)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
