// Guards the active public prompt builders used by generation stages.
import assert from "node:assert/strict";
import test from "node:test";
import * as prompts from "./index.js";

const REQUIRED_RUNTIME_EXPORTS = [
  "JSON_ONLY_SYSTEM_PROMPT",
  "buildExtractRulesPrompt",
  "buildRepairExtractedRulesPrompt",
  "buildGenerateModelsPrompt",
  "buildModelRepairPrompt",
  "buildGenerateRequirementAnalysisPrompt",

  "buildGenerateDesignSequencePrompt",
  "buildGenerateDesignModelsPrompt",

  "buildGenerateDocumentContentPrompt",

] as const satisfies readonly (keyof typeof prompts)[];

test("prompts keep required runtime public exports available", () => {
  for (const exportName of REQUIRED_RUNTIME_EXPORTS) {
    assert.ok(exportName in prompts, `missing export ${exportName}`);
    assert.notEqual(prompts[exportName], undefined, `undefined export ${exportName}`);
  }
});
