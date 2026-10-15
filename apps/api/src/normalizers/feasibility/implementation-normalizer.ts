// Repairs deterministic provider aliases and validates complete feasibility plans before persistence.
import {
  completeFeasibilityImplementationPlanSchema,
  type FeasibilityImplementationPlan,
} from "@uml-platform/contracts";
import { z } from "zod";

type UnknownRecord = Record<string, unknown>;

export interface FeasibilityNormalizationResult {
  plan: FeasibilityImplementationPlan;
  actions: string[];
}

export interface FeasibilityContextExternalSystem {
  id: string;
  name: string;
}

function validationError(path: Array<string | number>, message: string): never {
  throw new z.ZodError([{
    code: z.ZodIssueCode.custom,
    path,
    message,
  }]);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function forceId(item: UnknownRecord, id: string, actions: string[]) {
  if (item.id !== id) actions.push("generated-subitem-id");
  return { ...item, id };
}

function forceAiProvenance(item: UnknownRecord, actions: string[]) {
  if (item.provenance !== "ai-estimate") actions.push("normalized-provenance");
  return { ...item, provenance: "ai-estimate" };
}

function normalizeSourceItem(
  value: unknown,
  id: string | null,
  actions: string[],
) {
  if (!isRecord(value)) return value;
  const withId = id ? forceId(value, id, actions) : value;
  return forceAiProvenance(withId, actions);
}

function normalizeCollection(
  value: unknown,
  prefix: string,
  actions: string[],
  transform?: (item: UnknownRecord, index: number) => UnknownRecord,
) {
  if (!Array.isArray(value)) return value;
  return value.map((rawItem, index) => {
    if (!isRecord(rawItem)) return rawItem;
    const item = transform ? transform(rawItem, index) : rawItem;
    return normalizeSourceItem(item, `${prefix}-${index + 1}`, actions);
  });
}

function scopesWithItems(implementation: UnknownRecord) {
  const scopes = new Set<string>();
  if (Array.isArray(implementation.integrations) && implementation.integrations.length > 0) {
    scopes.add("integrations");
  }
  if (
    Array.isArray(implementation.milestones) &&
    implementation.milestones.some(
      (item) => isRecord(item) && Array.isArray(item.dependencies) && item.dependencies.length > 0,
    )
  ) {
    scopes.add("dependencies");
  }
  if (Array.isArray(implementation.costEstimates)) {
    for (const item of implementation.costEstimates) {
      if (!isRecord(item)) continue;
      if (item.category === "capital") scopes.add("capital-costs");
      if (item.category === "other-one-time") scopes.add("other-one-time-costs");
      if (item.category === "recurring") scopes.add("recurring-costs");
    }
  }
  if (Array.isArray(implementation.benefitEstimates)) {
    for (const item of implementation.benefitEstimates) {
      if (!isRecord(item)) continue;
      if (item.category === "one-time") scopes.add("one-time-benefits");
      if (item.category === "recurring") scopes.add("recurring-benefits");
      if (item.category === "intangible") scopes.add("intangible-benefits");
    }
  }
  return scopes;
}

function normalizeAbsenceDeclarations(
  value: unknown,
  implementation: UnknownRecord,
  actions: string[],
) {
  if (!Array.isArray(value)) return value;
  const itemScopes = scopesWithItems(implementation);
  const seen = new Set<string>();
  const declarations: UnknownRecord[] = [];

  for (const rawItem of value) {
    if (!isRecord(rawItem)) continue;
    let item = { ...rawItem };
    if (
      (typeof item.reason !== "string" || !item.reason.trim()) &&
      typeof item.rationale === "string" &&
      item.rationale.trim()
    ) {
      item.reason = item.rationale;
      actions.push("aliased-rationale-to-reason");
    }
    delete item.rationale;
    item = forceAiProvenance(item, actions);
    const scope = typeof item.scope === "string" ? item.scope : "";
    if (seen.has(scope)) {
      actions.push("removed-duplicate-absence-scope");
      continue;
    }
    if (itemScopes.has(scope)) {
      actions.push("removed-conflicting-absence-declaration");
      continue;
    }
    seen.add(scope);
    declarations.push(item);
  }
  return declarations;
}

function normalizeIntegration(
  rawItem: UnknownRecord,
  externalSystems: readonly FeasibilityContextExternalSystem[] | undefined,
  actions: string[],
) {
  const item = { ...rawItem };
  if (
    (typeof item.responsibility !== "string" || !item.responsibility.trim()) &&
    typeof item.purpose === "string" &&
    item.purpose.trim()
  ) {
    item.responsibility = item.purpose;
    actions.push("aliased-purpose-to-responsibility");
  }
  delete item.purpose;

  if (externalSystems && !item.contextExternalSystemId) {
    const name = typeof item.name === "string" ? item.name.trim().toLocaleLowerCase() : "";
    const matches = externalSystems.filter(
      (external) => external.name.trim().toLocaleLowerCase() === name,
    );
    if (matches.length === 1) {
      item.contextExternalSystemId = matches[0]!.id;
      actions.push("linked-integration-by-external-system-name");
    }
  }
  return item;
}

function normalizeStructuralOutput(
  value: unknown,
  externalSystems: readonly FeasibilityContextExternalSystem[] | undefined,
  actions: string[],
) {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return value;
  return {
    ...value,
    candidates: value.candidates.map((rawCandidate, candidateIndex) => {
      if (!isRecord(rawCandidate)) return rawCandidate;
      const candidateId = typeof rawCandidate.id === "string" && rawCandidate.id.trim()
        ? rawCandidate.id
        : `candidate-${candidateIndex + 1}`;
      let candidate: UnknownRecord = forceAiProvenance(
        { ...rawCandidate, id: candidateId },
        actions,
      );
      if (!isRecord(rawCandidate.implementation)) return candidate;

      const rawImplementation = rawCandidate.implementation;
      let implementation: UnknownRecord = forceAiProvenance(rawImplementation, actions);
      const architecture = isRecord(implementation.architecture)
        ? {
            ...implementation.architecture,
            modules: normalizeCollection(
              implementation.architecture.modules,
              `${candidateId}-module`,
              actions,
            ),
          }
        : implementation.architecture;

      implementation = {
        ...implementation,
        architecture,
        dataStrategy: normalizeSourceItem(implementation.dataStrategy, null, actions),
        integrations: normalizeCollection(
          implementation.integrations,
          `${candidateId}-integration`,
          actions,
          (item) => normalizeIntegration(item, externalSystems, actions),
        ),
        deploymentAndOperations: normalizeSourceItem(
          implementation.deploymentAndOperations,
          null,
          actions,
        ),
        securityAndCompliance: normalizeSourceItem(
          implementation.securityAndCompliance,
          null,
          actions,
        ),
        milestones: normalizeCollection(
          implementation.milestones,
          `${candidateId}-milestone`,
          actions,
        ),
        costEstimates: normalizeCollection(
          implementation.costEstimates,
          `${candidateId}-cost`,
          actions,
        ),
        benefitEstimates: normalizeCollection(
          implementation.benefitEstimates,
          `${candidateId}-benefit`,
          actions,
        ),
        risks: normalizeCollection(
          implementation.risks,
          `${candidateId}-risk`,
          actions,
        ),
        verdicts: Array.isArray(implementation.verdicts)
          ? implementation.verdicts.map((item) =>
              isRecord(item) ? forceAiProvenance(item, actions) : item)
          : implementation.verdicts,
        analysisPeriodAssumption: isRecord(implementation.analysisPeriodAssumption)
          ? forceAiProvenance(implementation.analysisPeriodAssumption, actions)
          : implementation.analysisPeriodAssumption,
      };
      implementation.absenceDeclarations = normalizeAbsenceDeclarations(
        implementation.absenceDeclarations,
        implementation,
        actions,
      );
      candidate = { ...candidate, implementation };
      return candidate;
    }),
  };
}

function normalizeRequirementReferenceAliases(
  value: unknown,
  validRequirementIds: ReadonlySet<string>,
  actions: string[],
): unknown {
  const validByLower = new Map(
    Array.from(validRequirementIds, (id) => [id.toLowerCase(), id]),
  );
  const normalizeId = (rawId: string) => {
    const direct = validByLower.get(rawId.trim().toLowerCase());
    if (direct) return direct;
    const numericAlias = rawId
      .trim()
      .match(/^(?:REQ|R)[-_]?0*(\d+)$/iu);
    if (!numericAlias) return rawId;
    const normalized = validByLower.get(`r${Number(numericAlias[1])}`);
    if (!normalized) return rawId;
    actions.push("normalized-requirement-id-alias");
    return normalized;
  };
  const visit = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(visit);
    if (!isRecord(current)) return current;
    return Object.fromEntries(
      Object.entries(current).map(([key, item]) => [
        key,
        key === "sourceRequirementIds" && Array.isArray(item)
          ? item.map((id) => (typeof id === "string" ? normalizeId(id) : id))
          : visit(item),
      ]),
    );
  };
  return visit(value);
}

export function normalizeFeasibilityImplementationDetailed(
  value: unknown,
  validRequirementIds: ReadonlySet<string>,
  externalSystems?: readonly FeasibilityContextExternalSystem[],
): FeasibilityNormalizationResult {
  const actions: string[] = [];
  const plan = completeFeasibilityImplementationPlanSchema.parse(
    normalizeRequirementReferenceAliases(
      normalizeStructuralOutput(value, externalSystems, actions),
      validRequirementIds,
      actions,
    ),
  );
  const candidateIds = new Set<string>();
  const validateSources = (
    ids: string[],
    assumption: string,
    label: string,
    path: Array<string | number>,
  ) => {
    for (const id of ids) {
      if (!validRequirementIds.has(id)) {
        validationError([...path, "sourceRequirementIds"], `${label}引用了不存在的需求规则：${id}`);
      }
    }
    if (ids.length === 0 && !assumption.trim()) {
      validationError([...path, "assumption"], `${label}必须引用需求规则或明确记录方案假设`);
    }
  };

  const externalIds = externalSystems
    ? new Set(externalSystems.map((external) => external.id))
    : null;
  for (const [candidateIndex, candidate] of plan.candidates.entries()) {
    const candidatePath = ["candidates", candidateIndex] as Array<string | number>;
    if (candidateIds.has(candidate.id)) {
      validationError([...candidatePath, "id"], `候选方案编号重复：${candidate.id}`);
    }
    candidateIds.add(candidate.id);
    validateSources(
      candidate.sourceRequirementIds,
      candidate.assumption,
      `候选方案 ${candidate.id}`,
      candidatePath,
    );
    const implementation = candidate.implementation!;
    implementation.architecture.modules.forEach((item, index) =>
      validateSources(
        item.sourceRequirementIds,
        item.assumption,
        `模块 ${item.id}`,
        [...candidatePath, "implementation", "architecture", "modules", index],
      ));
    validateSources(
      implementation.dataStrategy.sourceRequirementIds,
      implementation.dataStrategy.assumption,
      `候选方案 ${candidate.id} 的数据策略`,
      [...candidatePath, "implementation", "dataStrategy"],
    );
    if (externalIds) {
      if (externalIds.size === 0 && implementation.integrations.length > 0) {
        validationError(
          [...candidatePath, "implementation", "integrations"],
          `候选方案 ${candidate.id} 的上下文没有外部系统，integrations 必须为空`,
        );
      }
      for (const [integrationIndex, integration] of implementation.integrations.entries()) {
        if (
          !integration.contextExternalSystemId ||
          !externalIds.has(integration.contextExternalSystemId)
        ) {
          validationError(
            [
              ...candidatePath,
              "implementation",
              "integrations",
              integrationIndex,
              "contextExternalSystemId",
            ],
            `集成 ${integration.id} 必须通过 contextExternalSystemId 引用上下文中的真实外部系统`,
          );
        }
      }
    }
    implementation.integrations.forEach((item, index) =>
      validateSources(
        item.sourceRequirementIds,
        item.assumption,
        `集成 ${item.id}`,
        [...candidatePath, "implementation", "integrations", index],
      ));
    validateSources(
      implementation.deploymentAndOperations.sourceRequirementIds,
      implementation.deploymentAndOperations.assumption,
      `候选方案 ${candidate.id} 的部署方案`,
      [...candidatePath, "implementation", "deploymentAndOperations"],
    );
    validateSources(
      implementation.securityAndCompliance.sourceRequirementIds,
      implementation.securityAndCompliance.assumption,
      `候选方案 ${candidate.id} 的安全方案`,
      [...candidatePath, "implementation", "securityAndCompliance"],
    );
    implementation.milestones.forEach((item, index) =>
      validateSources(
        item.sourceRequirementIds,
        item.assumption,
        `里程碑 ${item.id}`,
        [...candidatePath, "implementation", "milestones", index],
      ));
    implementation.costEstimates.forEach((item, index) =>
      validateSources(
        item.sourceRequirementIds,
        item.assumption,
        `成本估算 ${item.id}`,
        [...candidatePath, "implementation", "costEstimates", index],
      ));
    implementation.benefitEstimates.forEach((item, index) =>
      validateSources(
        item.sourceRequirementIds,
        item.assumption,
        `收益估算 ${item.id}`,
        [...candidatePath, "implementation", "benefitEstimates", index],
      ));
    implementation.risks.forEach((item, index) =>
      validateSources(
        item.sourceRequirementIds,
        item.assumption,
        `风险 ${item.id}`,
        [...candidatePath, "implementation", "risks", index],
      ));
    const verdictCategories = implementation.verdicts.map((item) => item.category);
    if (new Set(verdictCategories).size !== 5) {
      validationError(
        [...candidatePath, "implementation", "verdicts"],
        `候选方案 ${candidate.id} 的五类可行性结论必须各出现一次`,
      );
    }
  }
  return { plan, actions: [...new Set(actions)] };
}

export function normalizeFeasibilityImplementation(
  value: unknown,
  validRequirementIds: ReadonlySet<string>,
  externalSystems?: readonly FeasibilityContextExternalSystem[],
): FeasibilityImplementationPlan {
  return normalizeFeasibilityImplementationDetailed(
    value,
    validRequirementIds,
    externalSystems,
  ).plan;
}
