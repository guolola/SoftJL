// Defines generation repair budgets and same-stage model dependency constraints.
import { designDependencies } from "./design-freshness.js";

export const MAX_GENERATION_REPAIR_ATTEMPTS = 5;

export type ModelGenerationStage = "requirements" | "design";

export function modelGenerationUpstreams(stage: ModelGenerationStage, target: string): string[] {
  const dependencies: Record<string, readonly string[]> = stage === "design" ? designDependencies : { analysis: ["usecase"] };
  const sources = new Set<string>();
  const visit = (kind: string) => {
    for (const source of dependencies[kind] ?? []) {
      if (sources.has(source)) continue;
      sources.add(source);
      visit(source);
    }
  };
  visit(target);
  return [...sources];
}

// Reject both selection orders, including indirect dependencies such as class -> component -> deployment.
export function conflictingModelGenerationTarget(stage: ModelGenerationStage, target: string, batch: readonly string[]): string | undefined {
  const upstreams = modelGenerationUpstreams(stage, target);
  return batch.find(other => other !== target && (upstreams.includes(other) || modelGenerationUpstreams(stage, other).includes(target)));
}

// Bulk selection preserves existing choices, then adds only independent targets in display order.
export function independentModelGenerationTargets<T extends string>(stage: ModelGenerationStage, targets: readonly T[]): T[] {
  const selected: T[] = [];
  for (const target of targets) {
    if (!selected.includes(target) && !conflictingModelGenerationTarget(stage, target, selected)) selected.push(target);
  }
  return selected;
}
