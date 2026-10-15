// Removes retired prototype payloads at persistence boundaries without touching UML source or error codes.
export const retiredCodeFields = [
  "codeSpec", "codeBusinessLogic", "codeFiles", "codeEntryFile", "codeDependencies",
  "codeUiMockup", "codeAgentPlan", "codeSkills", "codeSkillDiagnostics", "codeSkillResourcePlan",
  "codeSkillContext", "codeDiagnostics", "codeEditVersion", "codeTrace", "codeContextHash",
  "designToCodeMapping", "designModelCoverageReport", "loadedCodeSkill", "selectedCodeSkills",
  "uiMockup", "uiReferenceSpec", "uiFidelityReport", "visualDirection", "skillResourceDiscoveryPlan",
  "skillResourcePreviews", "skillResourcePlan", "appBlueprint", "uiBlueprint", "designTokens",
  "componentRegistry", "uiIr", "visualDiffReport", "businessAssertionResults", "repairLoopSummary",
  "codeImplementationBrief", "codeFileOperationManifest", "fileGenerationDiagnostics", "qualityDiagnostics",
  "codeGenerationMode", "codeArtifacts", "codeDiagnosticCount", "codeDiagnosticSummary", "codeQualityIssueCount",
] as const;
export const retiredCodeStages = [
  "analyze_code_business_logic", "analyze_code_product", "plan_code_ui", "generate_code_ui_mockup",
  "analyze_code_ui_mockup", "generate_code_ui_ir", "load_web_design_skill", "select_code_skills",
  "plan_code_files", "generate_code_spec", "generate_code_files", "plan_code", "write_code_files",
  "audit_code_quality", "verify_code_ui_fidelity", "verify_code_rendered_preview",
  "verify_code_business_assertions", "verify_code_preview", "repair_code_files",
] as const;
const fields = new Set<string>(retiredCodeFields);
const stages = new Set<string>(retiredCodeStages);
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
export function isLegacyCodeSnapshot(value: unknown): boolean {
  return record(value) && "files" in value;
}
export function isRetiredCodeRecord(value: unknown): boolean {
  if (!record(value)) return false;
  const selection = record(value.selection) ? value.selection : value;
  return isLegacyCodeSnapshot(value) || isLegacyCodeSnapshot(value.snapshot) ||
    value.runKind === "code" || value.kind === "code" || value.type === "code_file_changed" ||
    selection.workspaceId === "code" || value.artifactType === "code" ||
    value.fromArtifactType === "code" || value.toArtifactType === "code";
}
export function stripRetiredCodeData<T>(value: T): T {
  if (Array.isArray(value)) return value.filter((item) => !isRetiredCodeRecord(item)).map(stripRetiredCodeData) as T;
  if (!record(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (fields.has(key) || (key === "snapshot" && isLegacyCodeSnapshot(child))) continue;
    result[key] = stripRetiredCodeData(child);
  }
  if (typeof result.currentStage === "string" && stages.has(result.currentStage)) {
    result.currentStage = null;
    if ("runStatus" in result) result.runStatus = "idle";
    if ("runProgress" in result) result.runProgress = 0;
    if ("runMessage" in result) result.runMessage = null;
    if ("errorMessage" in result) result.errorMessage = null;
  }
  return result as T;
}
