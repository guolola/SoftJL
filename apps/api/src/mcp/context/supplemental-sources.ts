// Whitelists saved feasibility sources without exposing reviews, prototypes or personal metadata.
import { z } from "zod";
import {
  contextDiagramSpecSchema,
  contextTraceRowSchema,
  feasibilityInputsSchema,
  feasibilityBusinessFlowSchema,
  feasibilityImplementationPlanSchema,
  buildAcceptedRequirementSnapshot,
  buildFeasibilityImplementationFingerprint,
  buildFeasibilityContextFingerprint,
} from "@uml-platform/contracts";
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export function supplementalSources(state: Record<string, unknown>) {
  const outputs: {
    id: string;
    title: string;
    requirementIds: string[];
    payload: Record<string, unknown>;
    stored: unknown;
    current: string;
  }[] = [];
  const inputs = feasibilityInputsSchema.safeParse(state.feasibilityInputs);
  if (inputs.success) {
    const {
      targetEnvironment,
      teamSkills,
      availableResources,
      legalConstraints,
      expectedUsers,
    } = inputs.data;
    if (
      [
        targetEnvironment,
        teamSkills,
        availableResources,
        legalConstraints,
        expectedUsers,
      ].some(Boolean)
    )
      outputs.push({
        id: "feasibility:inputs",
        title: "用户保存的实施环境与约束",
        requirementIds: [],
        payload: {
          targetEnvironment,
          teamSkills,
          availableResources,
          legalConstraints,
          expectedUsers,
        },
        stored: null,
        current: "",
      });
  }
  const current = buildAcceptedRequirementSnapshot(
    state.rules ?? [],
    state.requirementBaseline ?? null,
  ).snapshot.fingerprint;
  const contextCurrent = buildFeasibilityContextFingerprint({
    rules: state.rules ?? [], requirementBaseline: state.requirementBaseline ?? null,
    inputs: state.feasibilityInputs ?? {},
  });

  const context = contextDiagramSpecSchema.safeParse(
    state.feasibilityContextModel,
  );
  const trace = z
    .array(contextTraceRowSchema)
    .safeParse(state.feasibilityContextTraceability);
  if (context.success)
    outputs.push({
      id: "feasibility:context",
      title: context.data.title,
      requirementIds: trace.success
        ? trace.data.map((entry) => entry.requirementId)
        : [],
      payload: {
        model: context.data,
        traceability: trace.success ? trace.data : [],
        plantUml:
          typeof state.feasibilityContextPlantUml === "string"
            ? state.feasibilityContextPlantUml
            : null,
      },
      stored: state.feasibilityContextFingerprint,
      current: contextCurrent,
    });
  const flow = feasibilityBusinessFlowSchema.safeParse(
    state.feasibilityBusinessFlow,
  );
  if (flow.success)
    outputs.push({
      id: "feasibility:business-flow",
      title: flow.data.model.title,
      requirementIds: flow.data.traceability.map(
        (entry) => entry.requirementId,
      ),
      payload: {
        ...flow.data,
        plantUml:
          typeof object(object(state.feasibilityBusinessFlow).plantUml)
            .source === "string"
            ? object(object(state.feasibilityBusinessFlow).plantUml).source
            : null,
      },
      stored: object(state.feasibilityBusinessFlow).fingerprint,
      current,
    });
  // Read the current saved contract directly; source extraction never migrates persisted data.
  const implementation = feasibilityImplementationPlanSchema.safeParse(state.feasibilityImplementationPlan);
  if (implementation.success) {
    const expected = buildFeasibilityImplementationFingerprint({
      rules: state.rules ?? [],
      requirementBaseline: state.requirementBaseline ?? null,
      contextModel: state.feasibilityContextModel ?? null,
      businessFlow: flow.success ? flow.data : null,
      inputs: state.feasibilityInputs ?? {},
    });

    outputs.push({
      id: "feasibility:implementation",
      title: "实施建议与候选方案（需确认）",
      requirementIds: [],
      payload: {
        implementation: implementation.data,
        technologyAdvice:
          "候选技术方案不等于学生已确认的技术要求；优先遵守原始需求及本地仓库。",
      },
      stored: state.feasibilityImplementationFingerprint,
      current: expected,
    });
  }
  return outputs;
}
