// Guards the runtime prompt-builder export surface before splitting prompt internals.
import assert from "node:assert/strict";
import test from "node:test";
import * as prompts from "./index.js";

const REQUIRED_RUNTIME_EXPORTS = [
  "JSON_ONLY_SYSTEM_PROMPT",
  "buildExtractRulesPrompt",
  "buildGenerateModelsPrompt",
  "buildGenerateRequirementAnalysisPrompt",
  "buildRepairModelsPrompt",
  "buildGenerateRequirementTraceabilityPrompt",
  "buildRepairRequirementTraceabilityPrompt",
  "buildGenerateDesignSequencePrompt",
  "buildGenerateDesignModelsPrompt",
  "buildRepairDesignModelsPrompt",
  "buildGenerateDesignTraceabilityPrompt",
  "buildRepairDesignTraceabilityPrompt",
  "buildGenerateCodeSpecPrompt",
  "buildGenerateCodeAppBlueprintPrompt",
  "buildAnalyzeCodeBusinessLogicPrompt",
  "buildGenerateCodeUiBlueprintPrompt",
  "buildGenerateCodeUiMockupPrompt",
  "buildAnalyzeCodeUiMockupPrompt",
  "buildGenerateCodeDesignTokensPrompt",
  "buildGenerateCodeComponentRegistryPrompt",
  "buildGenerateCodeUiIrPrompt",
  "buildGenerateCodeFilePlanPrompt",
  "buildGenerateCodeFilesPrompt",
  "buildGenerateCodeAgentPlanPrompt",
  "buildGenerateCodeFileOperationsPrompt",
  "buildRepairCodeFileOperationsPrompt",
  "buildGenerateCodeSkillResourcePlanPrompt",
  "buildGenerateCodeVisualDirectionPrompt",
  "buildGenerateCodeSkillResourceDiscoveryPrompt",
  "buildVerifyCodeUiFidelityPrompt",
  "buildGenerateDocumentContentPrompt",
  "buildRepairDocumentContentPrompt",
] as const;

test("prompts keep required runtime public exports available", () => {
  for (const exportName of REQUIRED_RUNTIME_EXPORTS) {
    assert.ok(exportName in prompts, `missing export ${exportName}`);
    assert.notEqual(prompts[exportName], undefined, `undefined export ${exportName}`);
  }
});
