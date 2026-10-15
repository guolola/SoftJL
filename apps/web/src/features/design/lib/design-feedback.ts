// Maps design-generation blockers to stable user guidance and safe navigation targets.
export type DesignGuidanceTarget =
  | "system-requirements"
  | "requirement-models"
  | "requirement-traceability"
  | "sequence-design"
  | "design-class"
  | "design-component";

export interface DesignBlockGuidance {
  dedupeKey: string;
  target: DesignGuidanceTarget;
}

export function designBlockGuidance(reason: string): DesignBlockGuidance {
  if (reason === "请先输入需求文本" || reason.includes("需求规则")) {
    return {
      dedupeKey: "design-generation:system-requirements",
      target: "system-requirements",
    };
  }
  if (reason.includes("用例实现设计覆盖不足")) {
    return {
      dedupeKey: "design-generation:sequence-coverage",
      target: "sequence-design",
    };
  }
  if (reason.includes("追踪")) {
    return {
      dedupeKey: "design-generation:requirement-traceability",
      target: "requirement-traceability",
    };
  }
  if (reason.includes("设计类图")) {
    return {
      dedupeKey: "design-generation:design-class",
      target: "design-class",
    };
  }
  if (reason.includes("组件（构件）关系")) {
    return {
      dedupeKey: "design-generation:design-component",
      target: "design-component",
    };
  }
  return {
    dedupeKey: "design-generation:requirement-models",
    target: "requirement-models",
  };
}
