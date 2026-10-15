// Verifies that retirement removes prototype payloads while preserving UML, documents and ordinary errors.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLegacyCodeSnapshot, stripRetiredCodeData } from "./legacy-code-retirement.js";

describe("retired prototype data", () => {
  it("removes explicit fields and code records recursively without deleting error codes or UML source", () => {
    const input = {
      codeFiles: { "/src/App.tsx": "legacy code" },
      models: { prototype: { diagramKind: "prototype", nodes: [{ id: "page" }] } },
      plantUml: { prototype: "@startuml\n@enduml" },
      error: { code: "RUN_CANCELLED", message: "unchanged" },
      history: [{ snapshot: { files: {}, status: "failed" } }, { snapshot: { models: [], codeTrace: [], error: { code: "ordinary" } } }],
      tabs: [{ selection: { workspaceId: "code" } }, { selection: { kind: "design-home" } }],
      links: [{ fromArtifactType: "code" }, { fromArtifactType: "requirement", toArtifactType: "design-model" }],
      currentStage: "write_code_files", runStatus: "running", runProgress: 74,
    };
    const output = stripRetiredCodeData(input);
    assert.equal("codeFiles" in output, false);
    assert.deepEqual(output.models, input.models);
    assert.deepEqual(output.plantUml, input.plantUml);
    assert.deepEqual(output.error, input.error);
    assert.deepEqual(output.history, [{ snapshot: { models: [], error: { code: "ordinary" } } }]);
    assert.deepEqual(output.tabs, [{ selection: { kind: "design-home" } }]);
    assert.equal(output.links.length, 1);
    assert.equal(output.currentStage, null);
    assert.equal(output.runStatus, "idle");
    assert.equal(output.runProgress, 0);
    assert.deepEqual(stripRetiredCodeData(output), output);
    assert.equal(input.codeFiles["/src/App.tsx"], "legacy code");
  });
  it("identifies even empty, queued code snapshots and retains document snapshots", () => {
    assert.equal(isLegacyCodeSnapshot({ files: {}, status: "queued" }), true);
    assert.equal(isLegacyCodeSnapshot({ documentKind: "softwareDesignSpec", sections: [] }), false);
  });
});
