// Single source for the direct upstream inputs of each generation card. Pages, the workflow
// illustration, and tests read this mapping; design inputs derive from the generation planner maps.
import { type RequirementRuleType, type FeasibilityArtifactKind, type RequirementBaseline, type RequirementRule } from "@uml-platform/contracts";
import type { TFunction } from "i18next";
import {
  ClipboardCheck,
  ListChecks,
  Paperclip,
  type LucideIcon,
} from "lucide-react";
import {
  DESIGN_DIAGRAM_ORDER,
  DIAGRAM_ORDER,
  getDesignDiagramLabel,
  getDiagramLabel,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import { DESIGN_DIAGRAM_ICON, FEASIBILITY_ARTIFACT_ICON, REQUIREMENT_DIAGRAM_ICON } from "../../../entities/diagram/model-icons";
import { getRuleDisplayLabel, REQUIREMENT_KIND_ORDER, } from "../../../entities/requirement-rule/model";
import { RULE_KIND_COLOR_INDEX, RULE_KIND_ICON } from "../../../entities/requirement-rule/model-icons";
export { DESIGN_DIAGRAM_ICON, FEASIBILITY_ARTIFACT_ICON, REQUIREMENT_DIAGRAM_ICON } from "../../../entities/diagram/model-icons";
import {
  DESIGN_MODEL_DEPENDENCY_MAP,
  DESIGN_REQUIREMENT_SOURCE_MAP,
} from "../../workspace-session/lib/generation-planning";

export const FEASIBILITY_ARTIFACT_ORDER = ["context", "business-flow", "implementation"] as const satisfies readonly FeasibilityArtifactKind[];

export type UpstreamStage = "feasibility" | "requirement" | "design";

export type UpstreamInput =
  | { kind: "rules"; relevant?: boolean }
  | { kind: "baseline"; constraints?: boolean }
  | { kind: "supplementary"; optional: true }
  | { kind: "feasibility"; artifact: FeasibilityArtifactKind }
  // `eventFlows` narrows a use-case model input to the event flows a target actually reads.
  | { kind: "requirement"; diagram: DiagramType; eventFlows?: "single-use-case" | "all-use-cases" }
  | { kind: "design"; diagram: DesignDiagramType };

/** Separates saved input availability from this batch's planned and active generation. */
export type UpstreamInputState = "ready" | "missing" | "stale" | "planned" | "running";

const RULES: UpstreamInput = { kind: "rules" };
const RELEVANT_RULES: UpstreamInput = { kind: "rules", relevant: true };
const BASELINE: UpstreamInput = { kind: "baseline" };
const BASELINE_CONSTRAINTS: UpstreamInput = { kind: "baseline", constraints: true };
const SUPPLEMENTARY: UpstreamInput = { kind: "supplementary", optional: true };
const REQUIREMENT_RULE_INPUTS = [RELEVANT_RULES, BASELINE] as const;

export const FEASIBILITY_UPSTREAM_INPUTS: Record<FeasibilityArtifactKind, readonly UpstreamInput[]> = {
  context: [RULES, BASELINE, SUPPLEMENTARY],
  "business-flow": [RULES, BASELINE],
  implementation: [
    { kind: "feasibility", artifact: "context" },
    { kind: "feasibility", artifact: "business-flow" },
    RULES,
    BASELINE,
    SUPPLEMENTARY,
  ],
};

export const REQUIREMENT_UPSTREAM_INPUTS: Record<DiagramType, readonly UpstreamInput[]> = {
  context: REQUIREMENT_RULE_INPUTS,
  function: REQUIREMENT_RULE_INPUTS,
  activity: REQUIREMENT_RULE_INPUTS,
  usecase: REQUIREMENT_RULE_INPUTS,
  class: REQUIREMENT_RULE_INPUTS,
  prototype: REQUIREMENT_RULE_INPUTS,
  deployment: REQUIREMENT_RULE_INPUTS,
  // Each analysis model is generated per use case from that use case's event flows.
  analysis: [{ kind: "requirement", diagram: "usecase", eventFlows: "single-use-case" }],
};

// Design inputs reuse the planner's dependency maps so the illustration cannot drift from generation.
function designUpstreamInputs(diagram: DesignDiagramType): UpstreamInput[] {
  return [
    ...DESIGN_REQUIREMENT_SOURCE_MAP[diagram].map((source): UpstreamInput =>
      source === "usecase"
        ? { kind: "requirement", diagram: source, eventFlows: "all-use-cases" }
        : { kind: "requirement", diagram: source }),
    ...(diagram === "architecture" ? [BASELINE_CONSTRAINTS] : []),
    ...DESIGN_MODEL_DEPENDENCY_MAP[diagram].map((source): UpstreamInput => ({ kind: "design", diagram: source })),
  ];
}

export const DESIGN_UPSTREAM_INPUTS: Record<DesignDiagramType, readonly UpstreamInput[]> = {
  architecture: designUpstreamInputs("architecture"),
  sequence: designUpstreamInputs("sequence"),
  class: designUpstreamInputs("class"),
  navigation: designUpstreamInputs("navigation"),
  table: designUpstreamInputs("table"),
  component: designUpstreamInputs("component"),
  deployment: designUpstreamInputs("deployment"),
};

export type UpstreamStageTarget = {
  feasibility: FeasibilityArtifactKind;
  requirement: DiagramType;
  design: DesignDiagramType;
};

export function directUpstreamInputs<S extends UpstreamStage>(stage: S, target: UpstreamStageTarget[S]): readonly UpstreamInput[] {
  if (stage === "feasibility") return FEASIBILITY_UPSTREAM_INPUTS[target as FeasibilityArtifactKind];
  if (stage === "requirement") return REQUIREMENT_UPSTREAM_INPUTS[target as DiagramType];
  return DESIGN_UPSTREAM_INPUTS[target as DesignDiagramType];
}

export function upstreamInputKey(input: UpstreamInput) {
  switch (input.kind) {
    case "rules": return input.relevant ? "rules:relevant" : "rules";
    case "baseline": return input.constraints ? "baseline:constraints" : "baseline";
    case "supplementary": return "supplementary";
    case "feasibility": return `feasibility:${input.artifact}`;
    case "requirement": return input.eventFlows ? `requirement:${input.diagram}:${input.eventFlows}` : `requirement:${input.diagram}`;
    case "design": return `design:${input.diagram}`;
  }
}

// Inputs that are artifacts of the same stage have their own inputs; those are indirect dependencies.
function sameStageArtifactInputs(stage: UpstreamStage, input: UpstreamInput): readonly UpstreamInput[] | null {
  if (stage === "feasibility" && input.kind === "feasibility") return FEASIBILITY_UPSTREAM_INPUTS[input.artifact];
  if (stage === "requirement" && input.kind === "requirement") return REQUIREMENT_UPSTREAM_INPUTS[input.diagram];
  if (stage === "design" && input.kind === "design") return DESIGN_UPSTREAM_INPUTS[input.diagram];
  return null;
}

/** One level of indirect inputs, grouped by the direct same-stage artifact that carries them. */
export function indirectUpstreamInputs<S extends UpstreamStage>(stage: S, target: UpstreamStageTarget[S]) {
  const direct = directUpstreamInputs(stage, target);
  const directKeys = new Set(direct.map(upstreamInputKey));
  return direct.flatMap((via) => {
    const inputs = (sameStageArtifactInputs(stage, via) ?? []).filter((input) => !directKeys.has(upstreamInputKey(input)));
    return inputs.length > 0 ? [{ via, inputs }] : [];
  });
}

const ruleIdCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function sortUpstreamRules(rules: readonly RequirementRule[]) {
  // Display grouping never changes persisted rule order; numeric IDs keep R2 before R10.
  return [...rules].sort((left, right) =>
    REQUIREMENT_KIND_ORDER.indexOf(left.type) - REQUIREMENT_KIND_ORDER.indexOf(right.type) ||
    ruleIdCollator.compare(left.id, right.id),
  );
}

export type UpstreamRuleNode = { kind: RequirementRuleType; rule: RequirementRule | null; ordinal?: number };

export function upstreamRuleNodes(rules: readonly RequirementRule[], mappedTypes: readonly RequirementRuleType[] = []): UpstreamRuleNode[] {
  const ordered = sortUpstreamRules(rules);
  const presentTypes = new Set(rules.map(rule => rule.type));
  const ordinals = new Map<RequirementRuleType, number>();
  // Keep concrete sources first, then show one missing node per absent mapped type.
  // These describe input coverage; generation eligibility is checked separately.
  return [
    ...ordered.map(rule => {
      // Visible numbers are local to the type; stable rule IDs still own keys and references.
      const ordinal = (ordinals.get(rule.type) ?? 0) + 1;
      ordinals.set(rule.type, ordinal);
      return { kind: rule.type, rule, ordinal };
    }),
    ...REQUIREMENT_KIND_ORDER.filter(kind => mappedTypes.includes(kind) && !presentTypes.has(kind))
      .map(kind => ({ kind, rule: null })),
  ];
}

export function upstreamInputLabel(input: UpstreamInput, t: TFunction, rules?: readonly RequirementRule[]) {
  switch (input.kind) {
    case "rules":
      if (rules?.length) return upstreamRuleNodes(rules).map(({ rule, ordinal }) =>
        `${getRuleDisplayLabel(rule!, t)} ${ordinal}`,
      ).join(t("workflowIllustration.separator"));
      return t(input.relevant ? "workflowIllustration.inputs.relevantRules" : "workflowIllustration.inputs.rules");
    case "baseline": return t(input.constraints ? "workflowIllustration.inputs.baselineConstraints" : "workflowIllustration.inputs.baseline");
    case "supplementary": return t("workflowIllustration.inputs.supplementary");
    case "feasibility": return t(`feasibility.artifact.${input.artifact === "business-flow" ? "businessFlow" : input.artifact}`);
    case "requirement":
      if (input.eventFlows === "single-use-case") return t("workflowIllustration.inputs.singleUseCaseEventFlows");
      if (input.eventFlows === "all-use-cases") return t("workflowIllustration.inputs.useCaseEventFlows");
      return getDiagramLabel(input.diagram, t);
    case "design": return getDesignDiagramLabel(input.diagram, t);
  }
}

/** Names the artifact behind an input, e.g. the use-case model behind its event flows. */
export function upstreamArtifactLabel(input: UpstreamInput, t: TFunction) {
  return input.kind === "requirement" ? getDiagramLabel(input.diagram, t) : upstreamInputLabel(input, t);
}

export function upstreamInputIcon(input: UpstreamInput, ruleKind?: RequirementRuleType): LucideIcon {
  switch (input.kind) {
    case "rules": return ruleKind ? RULE_KIND_ICON[ruleKind] : ListChecks;
    case "baseline": return ClipboardCheck;
    case "supplementary": return Paperclip;
    case "feasibility": return FEASIBILITY_ARTIFACT_ICON[input.artifact];
    case "requirement": return REQUIREMENT_DIAGRAM_ICON[input.diagram];
    case "design": return DESIGN_DIAGRAM_ICON[input.diagram];
  }
}

// Artifact inputs keep the accent of their own card; shared inputs use the remaining accents.
export function upstreamInputColorIndex(input: UpstreamInput, ruleKind?: RequirementRuleType) {
  switch (input.kind) {
    case "rules": return ruleKind ? RULE_KIND_COLOR_INDEX[ruleKind] : 5;
    case "baseline": return 6;
    case "supplementary": return 7;
    case "feasibility": return FEASIBILITY_ARTIFACT_ORDER.indexOf(input.artifact);
    case "requirement": return Math.max(0, DIAGRAM_ORDER.indexOf(input.diagram));
    case "design": return DESIGN_DIAGRAM_ORDER.indexOf(input.diagram);
  }
}

export function upstreamStateFromAvailability(
  exists: boolean,
  stale: boolean,
  generation: { planned?: boolean; running?: boolean } = {},
): UpstreamInputState {
  if (generation.running) return "running";
  const availability = !exists ? "missing" : stale ? "stale" : "ready";
  // Selection promises a future input; it does not certify the saved artifact as ready.
  return availability !== "ready" && generation.planned ? "planned" : availability;
}

export function upstreamBaselineState(baseline: RequirementBaseline | null | undefined, stale: boolean): UpstreamInputState {
  const entries = baseline?.rules;
  return upstreamStateFromAvailability(Boolean(entries?.length), stale);
}
