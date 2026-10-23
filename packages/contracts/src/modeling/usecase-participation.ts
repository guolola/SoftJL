// Checks declared use-case participation without requiring redundant links on included or inherited use cases.
import type { UseCaseDiagramSpec, UseCaseRelationship } from "./models.js";

export function useCaseParticipationGaps(model: UseCaseDiagramSpec) {
  const actors = new Set(model.actors.map((actor) => actor.id));
  const cases = new Set(model.useCases.map((item) => item.id));
  const actorParents = new Map<string, string[]>();
  const caseNeighbours = new Map<string, string[]>();
  const actorContext = new Map<string, string[]>(), caseContext = new Map<string, string[]>();
  const add = (graph: Map<string, string[]>, from: string, to: string) => graph.set(from, [...graph.get(from) ?? [], to]);
  for (const edge of model.relationships) {
    if (edge.type === "generalization" && actors.has(edge.sourceId) && actors.has(edge.targetId)) {
      add(actorParents, edge.sourceId, edge.targetId);
      add(actorContext, edge.sourceId, edge.targetId); add(actorContext, edge.targetId, edge.sourceId);
    }
    if (cases.has(edge.sourceId) && cases.has(edge.targetId)) {
      // Auxiliary cases inherit the base context; an auxiliary association cannot establish a base actor's role.
      if (edge.type === "include") add(caseNeighbours, edge.targetId, edge.sourceId);
      if (edge.type === "extend" || edge.type === "generalization") add(caseNeighbours, edge.sourceId, edge.targetId);
      add(caseContext, edge.sourceId, edge.targetId); add(caseContext, edge.targetId, edge.sourceId);
    }
  }
  const reachable = (graph: Map<string, string[]>, start: string) => {
    const visited = new Set<string>(), pending = [start];
    while (pending.length) { const id = pending.pop()!; if (visited.has(id)) continue; visited.add(id); pending.push(...graph.get(id) ?? []); }
    return visited;
  };
  const covered = (actorId: string, useCaseId: string, relationships = model.relationships) => {
    const actorScope = reachable(actorParents, actorId), caseScope = reachable(caseNeighbours, useCaseId);
    return relationships.some((edge) => edge.type === "association" &&
      ((actorScope.has(edge.sourceId) && caseScope.has(edge.targetId)) || (actorScope.has(edge.targetId) && caseScope.has(edge.sourceId))));
  };
  const proposed: UseCaseRelationship[] = [...model.relationships];
  const ids = new Set([...actors, ...cases, ...model.systemBoundaries.map((item) => item.id), ...proposed.map((edge) => edge.id)]);
  const gaps: Array<{ actorId: string; useCaseId: string; path: string; relationship: UseCaseRelationship }> = [];
  // Prefer standalone/base use cases so shared auxiliary cases do not acquire duplicate lines.
  const auxiliary = new Set(model.relationships.flatMap((edge) => edge.type === "include" ? [edge.targetId] : edge.type === "extend" ? [edge.sourceId] : []));
  const ordered = model.useCases.map((item, index) => ({ item, index })).sort((a, b) => Number(auxiliary.has(a.item.id)) - Number(auxiliary.has(b.item.id)));
  for (const { item, index } of ordered) {
    const roles = [item.primaryActorId, ...item.supportingActorIds].filter((id): id is string => Boolean(id && actors.has(id)));
    for (const actorId of new Set(roles)) {
      if (covered(actorId, item.id, proposed)) continue;
      const base = `association:${actorId}:${item.id}`; let id = base, suffix = 1;
      while (ids.has(id)) id = `${base}:${suffix++}`;
      ids.add(id);
      const relationship: UseCaseRelationship = { id, type: "association", sourceId: actorId, targetId: item.id };
      proposed.push(relationship);
      gaps.push({ actorId, useCaseId: item.id, path: `useCases.${index}.${item.primaryActorId === actorId ? "primaryActorId" : "supportingActorIds"}`, relationship });
    }
  }
  // Diagram connectivity is broader than a declared role: abstract parents may be represented through their specializations.
  const contextualAssociation = (actorId: string, useCaseId: string) => {
    const actorScope = reachable(actorContext, actorId), caseScope = reachable(caseContext, useCaseId);
    return model.relationships.some((edge) => edge.type === "association" &&
      ((actorScope.has(edge.sourceId) && caseScope.has(edge.targetId)) || (actorScope.has(edge.targetId) && caseScope.has(edge.sourceId))));
  };
  const isolatedActors = model.actors.filter((actor) => !model.useCases.some((item) => contextualAssociation(actor.id, item.id)));
  const disconnectedCases = model.useCases.filter((item) => actors.size > 0 && !model.actors.some((actor) => contextualAssociation(actor.id, item.id)));
  return { gaps, isolatedActors, disconnectedCases, relationships: proposed };
}
