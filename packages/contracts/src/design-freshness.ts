// Propagates changes through recorded model dependencies while retaining unaffected artifacts.
import { designInputFingerprint, snapshotInputFingerprint } from "./fingerprints.js";
import { diagramKindSchema, type DiagramKind } from "./requirements.js";
import { requirementRuleTypeSchema, requirementTypeAppliesToModel } from "./requirement-rule-types.js";

export const designDependencies: Record<string, readonly string[]> = {
  architecture: [], sequence: [], class: [], navigation: [],
  component: ["class"], table: ["class"], deployment: ["component"],
};
// Generation, review and freshness share the same authoritative requirement-source policy.
export const designRequirementSources: Record<string, readonly DiagramKind[]> = {
  architecture: ["function"], sequence: ["usecase", "analysis"], class: ["class", "usecase"],
  navigation: ["prototype"], component: [], table: [], deployment: ["deployment"],
};
type State = Record<string, unknown>;
const object = (value: unknown): State => value && typeof value === "object" && !Array.isArray(value) ? value as State : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const ruleKey = (value: unknown) => String(value ?? "").trim().toLowerCase();
const kindOf = (id: string, value: unknown) => String(object(value).diagramKind ?? id.split(":")[0]);
const modelId = (id: string, value: unknown) => String(object(value).modelId ?? id);
const equal = (a: unknown, b: unknown) => snapshotInputFingerprint(a ?? null) === snapshotInputFingerprint(b ?? null);
const requirementFingerprint = (state: State) => snapshotInputFingerprint({ requirementText: state.requirementText ?? "", rules: state.rules ?? [] });
const designFingerprint = (state: State) => designInputFingerprint(Object.values(object(state.models)), array(state.requirementModelTraceability));
const staleFingerprint = (value: unknown) => String(value ?? "unknown").startsWith("stale:") ? String(value) : `stale:${String(value ?? "unknown")}`;

// Only published model receipts can clear a model-specific stale marker.
export function requirementOutputFingerprints(snapshot: {
  requirementText: string; rules: unknown[]; models: unknown[];
  outputManifest: readonly { kind: string; id: string }[];
}) {
  const published = new Set(snapshot.outputManifest.filter(output => output.kind === "model").map(output => output.id));
  const fingerprint = snapshotInputFingerprint({ requirementText: snapshot.requirementText, rules: snapshot.rules });
  return Object.fromEntries(snapshot.models.map(object).filter(model => published.has(String(model.modelId ?? model.diagramKind)))
    .map(model => [String(model.modelId ?? model.diagramKind), fingerprint]));
}

function refMatches(ref: unknown, id: string, model: unknown) {
  const target = object(ref);
  return target.modelId ? target.modelId === modelId(id, model) || target.modelId === id
    : target.diagramKind === kindOf(id, model);
}

// Explicit traces take precedence over the declared source policy and inherited design dependencies.
export function designRequirementModelIds(input: object, id: string, visited = new Set<string>()): string[] {
  const state = object(input);
  if (visited.has(id)) return [];
  visited.add(id);
  const designs = object(state.designModels), model = designs[id];
  if (!model) return [];
  const models = object(state.models);
  const traces = array(state.designModelTraceability).map(object).filter(row => refMatches(row.source, id, model));
  if (traces.length) return [...new Set(traces.flatMap(row => array(row.targets).flatMap(target =>
    Object.entries(models).filter(([key, item]) => refMatches(target, key, item)).map(([key]) => key))))];
  const kind = kindOf(id, model);
  const sourceCase = object(model).sourceUseCaseId;
  const direct = Object.entries(models).filter(([key, item]) => {
    if (!(designRequirementSources[kind] ?? []).includes(kindOf(key, item) as DiagramKind)) return false;
    return kindOf(key, item) !== "analysis" || !sourceCase || object(item).sourceUseCaseId === sourceCase || modelId(key, item) === `analysis:${sourceCase}`;
  }).map(([key]) => key);
  const inherited = Object.entries(designs).filter(([key, item]) =>
    (designDependencies[kind] ?? []).includes(kindOf(key, item)))
    .flatMap(([key]) => designRequirementModelIds(state, key, visited));
  return [...new Set([...direct, ...inherited])];
}

function ruleFacts(state: State) {
  const facts = new Map<string, unknown>();
  for (const rule of array(state.rules)) {
    const row = object(rule);
    if (typeof row.id === "string") facts.set(ruleKey(row.id), row);
  }
  return facts;
}

function affectedRequirementModels(previous: State, next: State) {
  const models = { ...object(previous.models), ...object(next.models) };
  const affected = new Set<string>();
  if ((previous.requirementText ?? "") !== (next.requirementText ?? "")) return new Set(Object.keys(models));
  const before = ruleFacts(previous), after = ruleFacts(next);
  const changedRules = new Set([...before.keys(), ...after.keys()].filter(id => !equal(before.get(id), after.get(id))));
  const traces = [...array(previous.requirementModelTraceability), ...array(next.requirementModelTraceability)].map(object);
  for (const ruleId of changedRules) {
    const mapped = traces.filter(row => ruleKey(row.ruleId) === ruleId);
    // Edits, additions and deletions affect both the old and new type's fixed model sets.
    const types = [object(before.get(ruleId)).type, object(after.get(ruleId)).type]
      .flatMap(value => { const parsed = requirementRuleTypeSchema.safeParse(value); return parsed.success ? [parsed.data] : []; });
    for (const [key, model] of Object.entries(models)) {
      const diagram = diagramKindSchema.safeParse(kindOf(key, model));
      // Per-use-case analysis instances inherit their event flow's concrete source scope.
      const scopedAnalysis = diagram.success && diagram.data === "analysis" && mapped.length > 0;
      if ((!scopedAnalysis && diagram.success && types.some(type => requirementTypeAppliesToModel(type, diagram.data))) ||
          mapped.some(row => refMatches(row.target, key, model))) affected.add(key);
    }
  }
  return affected;
}

// Analysis reads one event-flow scope, including linked cases and the actors/boundaries present in its prompt.
function analysisSourceContext(models: State, useCaseId: string): unknown {
  const source = Object.values(models).map(object).find(model => model.diagramKind === "usecase" &&
    array(model.useCases).some(item => object(item).id === useCaseId));
  if (!source) return null;
  const cases = array(source.useCases).map(object), relationships = array(source.relationships).map(object);
  const ids = new Set([useCaseId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of relationships) {
      if (edge.type === "association" || ![edge.sourceId, edge.targetId].some(id => ids.has(String(id)))) continue;
      for (const id of [edge.sourceId, edge.targetId]) {
        if (cases.some(item => item.id === id) && !ids.has(String(id))) { ids.add(String(id)); grew = true; }
      }
    }
  }
  const retained = new Set([...ids, ...array(source.actors).map(item => String(object(item).id)), ...array(source.systemBoundaries).map(item => String(object(item).id))]);
  return { useCases: cases.filter(item => ids.has(String(item.id))), actors: source.actors, systemBoundaries: source.systemBoundaries,
    relationships: relationships.filter(edge => retained.has(String(edge.sourceId)) && retained.has(String(edge.targetId))) };
}

export function invalidateDesignDependents(previousState: object, nextState: object, regeneratedKinds: string[] = []) {
  const previous = object(previousState), next = object(nextState);
  const oldRequirementFingerprint = requirementFingerprint(previous), newRequirementFingerprint = requirementFingerprint(next);
  const oldDesignFingerprint = designFingerprint(previous), newDesignFingerprint = designFingerprint(next);
  const beforeModels = object(previous.models), afterModels = object(next.models);
  const affected = affectedRequirementModels(previous, next);
  for (const [id, value] of Object.entries(afterModels)) {
    const model = object(value);
    if (model.diagramKind !== "analysis" || !(id in beforeModels) || !equal(beforeModels[id], value)) continue;
    const useCaseId = String(model.sourceUseCaseId ?? modelId(id, value).replace(/^analysis:/u, ""));
    if (!equal(analysisSourceContext(beforeModels, useCaseId), analysisSourceContext(afterModels, useCaseId))) affected.add(id);
  }
  const changedRequirements = new Set(affected);
  const tracesBefore = array(previous.requirementModelTraceability), tracesAfter = array(next.requirementModelTraceability);
  for (const id of new Set([...Object.keys(beforeModels), ...Object.keys(afterModels)])) {
    // Canonical digests exclude editor-only fields and ignore trace row ordering.
    const beforeContext = designInputFingerprint(beforeModels[id] ? [beforeModels[id]] : [],
      tracesBefore.filter(row => refMatches(object(row).target, id, beforeModels[id] ?? afterModels[id])));
    const afterContext = designInputFingerprint(afterModels[id] ? [afterModels[id]] : [],
      tracesAfter.filter(row => refMatches(object(row).target, id, afterModels[id] ?? beforeModels[id])));
    if (beforeContext !== afterContext) changedRequirements.add(id);
  }

  const oldInputs = object(previous.diagramInputFingerprints), inputs = { ...object(next.diagramInputFingerprints) };
  for (const [id, model] of Object.entries(afterModels)) {
    if (!(id in beforeModels)) continue;
    const key = modelId(id, model);
    const previousStamp = oldInputs[key];
    const wasFresh = previousStamp === oldRequirementFingerprint;
    const regenerated = inputs[key] === newRequirementFingerprint && inputs[key] !== oldInputs[key];
    if (regenerated) inputs[key] = newRequirementFingerprint;
    else if (wasFresh && oldRequirementFingerprint !== newRequirementFingerprint) inputs[key] = affected.has(id) ? oldRequirementFingerprint : newRequirementFingerprint;
    else if (affected.has(id)) inputs[key] = staleFingerprint(previousStamp);
  }
  // Keep the type-level indicator as the aggregate of its individual model receipts.
  for (const kind of new Set(Object.entries(afterModels).map(([id, model]) => kindOf(id, model)))) {
    const stamps = Object.entries(afterModels).filter(([id, model]) => kindOf(id, model) === kind)
      .map(([id, model]) => inputs[modelId(id, model)]);
    if (stamps.length && stamps.every(stamp => stamp === newRequirementFingerprint)) inputs[kind] = newRequirementFingerprint;
    else {
      const stale = stamps.find(stamp => typeof stamp === "string" && stamp !== newRequirementFingerprint);
      inputs[kind] = stale ?? "stale:unknown";
    }
  }

  const before = object(previous.designModels), after = object(next.designModels);
  if (!Object.keys(before).length) return { ...next, diagramInputFingerprints: inputs, designInputFingerprints: { ...object(next.designInputFingerprints) } };
  const regenerated = new Set(regeneratedKinds), changed = new Set<string>(), stale = new Set<string>();
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!equal(before[id] ?? null, after[id] ?? null)) changed.add(kindOf(id, after[id] ?? before[id]));
  }
  const fingerprints = { ...object(next.designInputFingerprints) }, oldFingerprints = object(previous.designInputFingerprints);
  const refreshed = new Set(Object.entries(after).filter(([id, model]) => fingerprints[id] === newDesignFingerprint &&
    (fingerprints[id] !== oldFingerprints[id] || !equal(before[id], model))).map(([id]) => id));
  for (const [id, model] of Object.entries(after)) {
    if (!(id in before) || regenerated.has(kindOf(id, model))) continue;
    if (refreshed.has(id)) continue;
    const dependencies = [...designRequirementModelIds(previous, id), ...designRequirementModelIds(next, id)];
    if (dependencies.some(key => changedRequirements.has(key))) stale.add(id);
    else if (oldFingerprints[id] === oldDesignFingerprint && fingerprints[id] === oldFingerprints[id]) fingerprints[id] = newDesignFingerprint;
  }
  // Changes to a design still flow through the existing design-stage dependency graph.
  let grew = true;
  while (grew) {
    grew = false;
    const staleKinds = new Set([...stale].map(id => kindOf(id, after[id])));
    for (const [id, model] of Object.entries(after)) {
      const kind = kindOf(id, model);
      const explicit = array(next.designModelTraceability).some(row => refMatches(object(row).source, id, model));
      if (!regenerated.has(kind) && !refreshed.has(id) && !stale.has(id) && (designDependencies[kind] ?? []).some(source => changed.has(source) || (!explicit && staleKinds.has(source)))) {
        stale.add(id); grew = true;
      }
    }
  }
  for (const id of stale) fingerprints[id] = staleFingerprint(fingerprints[id]);
  return { ...next, diagramInputFingerprints: inputs, designInputFingerprints: fingerprints };
}
