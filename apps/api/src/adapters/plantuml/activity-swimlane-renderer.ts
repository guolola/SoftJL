// Compiles business control flows into PlantUML's native vertical swimlane activity syntax.
import type { ActivityDiagramSpec, ActivityNode, ActivityRelationship, ModelRenderMapping } from "@uml-platform/contracts";
import { umlAlias } from "./plantuml-text.js";

// Labels occupy executable DSL lines: escape delimiters as visible text, including lane separators.
const text = (value: string) => value.replace(/\r?\n/g, "\\n").replace(/[&<>";|()[\]{}]/g, char => `&#${char.charCodeAt(0)};`);
// PlantUML spots accept one non-whitespace character. Keep every pair distinct.
const returnLabel = (index: number) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[index] ?? String.fromCharCode(0x4e00 + index - 62);

export class NativeActivityStructureError extends Error {}

export function renderActivitySwimlanes(model: ActivityDiagramSpec): { source: string; renderMapping: ModelRenderMapping } {
  if (!model.swimlanes.length) throw new NativeActivityStructureError("竖向业务流程图至少需要一条泳道");
  const lines = ["@startuml", "skinparam shadowing false", "skinparam conditionStyle inside"];
  const elements: ModelRenderMapping["elements"] = [];
  const relationships: ModelRenderMapping["relationships"] = [];
  const nodes = new Map(model.nodes.map(node => [node.id, node]));
  const outgoing = new Map(model.nodes.map(node => [node.id, model.relationships.filter(edge => edge.sourceId === node.id)]));
  const visited = new Set<string>();
  const emittedEdges = new Set<string>();
  const anchors = new Map<string, number>();
  const returnLabels = new Map<string, string>();
  const backTargets = new Set<string>();
  const scanning = new Set<string>(), scanned = new Set<string>();
  // Find graph return targets independently of the structured renderer's branch order.
  // In particular, a retry can enter a previously drawn branch behind a parallel join.
  const scan = (id: string) => {
    if (scanned.has(id)) return;
    scanning.add(id);
    for (const edge of outgoing.get(id) ?? []) {
      if (scanning.has(edge.targetId)) backTargets.add(edge.targetId);
      else scan(edge.targetId);
    }
    scanning.delete(id); scanned.add(id);
  };
  model.nodes.filter(node => node.type === "start").forEach(node => scan(node.id));
  let lane: string | undefined;
  const laneAlias = (id: string) => `lane_${umlAlias(id)}`;
  // Declare lanes once in model order, then switch by stable ID even when their names repeat.
  model.swimlanes.forEach(item => lines.push(`|${laneAlias(item.id)}| ${text(item.name)}`));
  const selectLane = (id: string | undefined) => {
    if (id && !model.swimlanes.some(item => item.id === id)) throw new NativeActivityStructureError(`泳道 ${id} 不存在`);
    if (id && id !== lane) { lines.push(`|${laneAlias(id)}|`); lane = id; }
  };
  selectLane(model.nodes.find(node => node.type === "start")?.actorOrLane ?? model.nodes.find(node => node.actorOrLane)?.actorOrLane ?? model.swimlanes[0]?.id);
  const element = (node: ActivityNode, statement: string) => {
    // A shared downstream path can occur in separate non-joining branches. Draw each
    // occurrence while keeping one canonical mapping for the original model identity.
    if (!visited.has(node.id)) anchors.set(node.id, lines.length);
    lines.push(`' @${visited.has(node.id) ? "repeat-element" : "element"} ${umlAlias(node.id)}`, statement);
    if (!visited.has(node.id)) elements.push({ elementId: node.id, alias: umlAlias(node.id), statement });
    visited.add(node.id);
  };
  const wording = (edge: ActivityRelationship) => [edge.guard, edge.condition, edge.trigger].filter(Boolean).join(" / ");
  const rememberRelationship = (edge: ActivityRelationship, statement: string) => {
    if (emittedEdges.has(edge.id)) return;
    emittedEdges.add(edge.id);
    relationships.push({ relationshipId: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, type: edge.type, symbol: "->", statement });
  };
  const relationship = (edge: ActivityRelationship, statement?: string) => {
    // Native edges are implicit in source order or a structured branch, never explicit graph aliases.
    const emitted = statement ?? (wording(edge) ? `-> ${text(wording(edge))};` : "->;");
    lines.push(`' @${emittedEdges.has(edge.id) ? "repeat-relationship" : "relationship"} ${umlAlias(edge.id)}`, emitted);
    rememberRelationship(edge, emitted);
  };

  const distances = (start: string, blocked: Set<string>, stops: Set<string>) => {
    const result = new Map<string, number>();
    const queue: Array<[string, number]> = [[start, 0]];
    for (let i = 0; i < queue.length; i++) {
      const [id, depth] = queue[i]!;
      if (result.has(id) || blocked.has(id)) continue;
      result.set(id, depth);
      if (stops.has(id)) continue;
      for (const edge of outgoing.get(id) ?? []) queue.push([edge.targetId, depth + 1]);
    }
    return result;
  };
  const convergence = (edges: ActivityRelationship[], blocked: Set<string>, stops: Set<string>, type?: "join") => {
    const routes = edges.map(edge => distances(edge.targetId, blocked, stops));
    return [...routes[0]!.keys()].filter(id => (!type || nodes.get(id)?.type === type) && routes.every(route => route.has(id)))
      .sort((a, b) => Math.max(...routes.map(route => route.get(a)!)) - Math.max(...routes.map(route => route.get(b)!))
        || routes.reduce((sum, route) => sum + route.get(a)! - route.get(b)!, 0))[0];
  };

  const simpleNode = (node: ActivityNode) => {
    switch (node.type) {
      case "start": element(node, "start"); break;
      case "end": element(node, "stop"); break;
      case "activity": {
        element(node, `:${text(node.name)};`);
        const annotations = [...node.input.map(value => `输入说明：${text(value)}`), ...node.output.map(value => `输出说明：${text(value)}`)];
        if (annotations.length) lines.push("note right", ...annotations, "end note");
        break;
      }
      case "merge": case "join": element(node, `label ${umlAlias(node.id)}_merge`); break;
      default: throw new Error(`Unsupported native activity node ${node.type}`);
    }
  };

  // Recover a business retry loop from its edges. Native goto compiles but does not
  // reliably draw return arrows across lanes, so actual cycles use repeat/while.
  const retryLoop = (header: string) => {
    const prefix: ActivityNode[] = [];
    const seen = new Set<string>();
    let cursor = header;
    while (!seen.has(cursor)) {
      seen.add(cursor);
      const node = nodes.get(cursor)!;
      const edges = outgoing.get(cursor) ?? [];
      if (node.type === "decision" && edges.length === 2) {
        for (const back of edges) {
          const actions: Extract<ActivityNode, { type: "activity" }>[] = [];
          let target = back.targetId;
          const path = new Set(seen);
          while (target !== header && !path.has(target)) {
            path.add(target);
            const step = nodes.get(target)!;
            const next = outgoing.get(target) ?? [];
            if (step.type !== "activity" || next.length !== 1) break;
            actions.push(step);
            target = next[0]!.targetId;
          }
          const exit = edges.find(edge => edge !== back)!;
          if (target === header && !seen.has(exit.targetId) && !actions.some(action => action.id === exit.targetId)) return { prefix, decision: node, back, exit, actions };
        }
        return;
      }
      if (!["activity", "merge"].includes(node.type) || edges.length !== 1) return;
      prefix.push(node);
      cursor = edges[0]!.targetId;
    }
  };
  const renderRetry = (loop: NonNullable<ReturnType<typeof retryLoop>>) => {
    const { prefix, decision, back, exit, actions } = loop;
    if (actions.length <= 1) {
      if (prefix[0]?.type !== "merge") lines.push("repeat");
      for (const [index, node] of prefix.entries()) {
        selectLane(node.actorOrLane);
        if (!index && node.type === "merge") element(node, "repeat");
        else simpleNode(node);
        relationship(outgoing.get(node.id)![0]!);
      }
      const retry = actions[0];
      if (retry) {
        selectLane(retry.actorOrLane);
        const returning = outgoing.get(retry.id)![0]!;
        const statement = `backward :${text(retry.name)};${wording(returning) ? ` (-> ${text(wording(returning))})` : ""}`;
        element(retry, statement);
        if (retry.input.length || retry.output.length) lines.push("note right", ...retry.input.map(value => `输入说明：${text(value)}`), ...retry.output.map(value => `输出说明：${text(value)}`), "end note");
        rememberRelationship(returning, statement);
      }
      selectLane(decision.actorOrLane);
      const statement = `repeat while (${text(decision.question ?? decision.name ?? "判断条件")}) is (${text(wording(back))}) not (${text(wording(exit))})`;
      element(decision, statement);
      rememberRelationship(back, statement);
      rememberRelationship(exit, statement);
    } else {
      // A while loop can contain several retry actions. Its initial prefix is also
      // drawn once before the condition, preserving the first execution's order.
      for (const node of prefix) {
        selectLane(node.actorOrLane);
        simpleNode(node);
        relationship(outgoing.get(node.id)![0]!);
      }
      selectLane(decision.actorOrLane);
      const statement = `while (${text(decision.question ?? decision.name ?? "判断条件")}) is (${text(wording(back))})`;
      element(decision, statement);
      rememberRelationship(back, statement);
      for (const node of actions) {
        selectLane(node.actorOrLane);
        simpleNode(node);
        relationship(outgoing.get(node.id)![0]!);
      }
      for (const node of prefix) {
        if (node.type === "activity") {
          selectLane(node.actorOrLane);
          lines.push(`' @repeat-element ${umlAlias(node.id)}`, `:${text(node.name)};`);
        }
        const edge = outgoing.get(node.id)![0]!;
        lines.push(wording(edge) ? `-> ${text(wording(edge))};` : "->;");
      }
      selectLane(decision.actorOrLane);
      const closing = `endwhile (${text(wording(exit))})`;
      lines.push(closing);
      rememberRelationship(exit, closing);
    }
    return exit.targetId;
  };

  const renderPath = (start: string, stops = new Set<string>(), ancestors = new Set<string>()) => {
    const activePath = new Set(ancestors);
    let current: string | undefined = start;
    while (current && !stops.has(current)) {
      const node = nodes.get(current)!;
      // Native paired connectors preserve non-local return edges without redrawing
      // business steps or forcing a cross-join graph into a different loop topology.
      if (visited.has(current) && (activePath.has(current) || backTargets.has(current))) {
        const label = returnLabels.get(current) ?? returnLabel(returnLabels.size);
        returnLabels.set(current, label);
        lines.push(`' @return-to ${umlAlias(current)}`, `(${label})`, "detach");
        return;
      }
      activePath.add(current);
      selectLane(node.actorOrLane);
      const retry = retryLoop(current);
      if (retry && ![...retry.prefix, retry.decision, ...retry.actions].some(item => item.id !== current && activePath.has(item.id))) {
        current = renderRetry(retry);
        continue;
      }
      const entryLane = lane;
      const edges: ActivityRelationship[] = outgoing.get(current) ?? [];
      if (node.type === "decision" || node.type === "fork" || edges.length > 1) {
        const blocked = activePath;
        const parallel = node.type !== "decision";
        const common = convergence(edges, blocked, stops, parallel ? "join" : undefined);
        const boundary = new Set(stops);
        if (common) boundary.add(common);
        let closedCommon = false;
        // Keep routing nodes after their incoming branches; array order never determines business order.
        if (parallel) {
          const keyword = common ? "fork" : "split";
          if (node.type === "fork") element(node, keyword);
          else { simpleNode(node); lines.push(keyword); }
          edges.forEach((edge, index) => {
            if (index) lines.push(`${keyword} again`);
            selectLane(entryLane);
            relationship(edge);
            renderPath(edge.targetId, boundary, activePath);
          });
          if (common && !stops.has(common)) {
            const join = nodes.get(common)!;
            selectLane(join.actorOrLane);
            element(join, "end fork");
            closedCommon = true;
          } else lines.push(common ? "end fork" : "end split");
        } else {
          const question = text(node.question ?? node.name ?? "判断条件");
          if (edges.length === 2) {
            const first = edges[0]!, second = edges[1]!;
            const statement = `if (${question}) then (${text(wording(first))})`;
            lines.push(`' @relationship ${umlAlias(first.id)}`);
            element(node, statement);
            // The condition command itself emits the first branch edge.
            rememberRelationship(first, statement);
            renderPath(first.targetId, boundary, activePath);
            relationship(second, `else (${text(wording(second))})`);
            selectLane(entryLane);
            renderPath(second.targetId, boundary, activePath);
          } else {
            element(node, `switch (${question})`);
            for (const edge of edges) {
              relationship(edge, `case (${text(wording(edge))})`);
              selectLane(entryLane);
              renderPath(edge.targetId, boundary, activePath);
            }
          }
          const closing = edges.length === 2 ? "endif" : "endswitch";
          const merge = common && nodes.get(common);
          if (merge && merge.type === "merge" && !stops.has(merge.id)) {
            selectLane(merge.actorOrLane);
            element(merge, closing);
            closedCommon = true;
          } else lines.push(closing);
        }
        if (!common || stops.has(common)) return;
        const commonNode = nodes.get(common)!;
        if (closedCommon) {
          const next = outgoing.get(common) ?? [];
          if (next.length !== 1) throw new Error(`Activity convergence ${common} needs one outgoing flow`);
          relationship(next[0]!);
          current = next[0]!.targetId;
        } else current = commonNode.id;
        continue;
      }
      simpleNode(node);
      if (!edges.length) return;
      relationship(edges[0]!);
      current = edges[0]!.targetId;
    }
  };

  const starts = model.nodes.filter(node => node.type === "start");
  const commonStart = starts.length > 1 ? convergence(starts.map(node => ({ id: node.id, type: "control_flow", sourceId: node.id, targetId: node.id })), new Set(), new Set()) : undefined;
  if (starts.length > 1) lines.push("split");
  starts.forEach((node, index) => {
    if (index) lines.push("split again");
    renderPath(node.id, new Set(commonStart ? [commonStart] : []));
  });
  if (starts.length > 1) lines.push("end split");
  if (commonStart) renderPath(commonStart);
  if (visited.size !== model.nodes.length || emittedEdges.size !== model.relationships.length) throw new Error("Native activity rendering omitted model nodes or relationships");
  lines.push("@enduml");
  // Insert entry connectors only for actual returns. Simple repeat/while diagrams
  // retain their existing source and layout without unused connector symbols.
  const entries = new Map([...returnLabels].map(([id, label]) => [anchors.get(id)!, `' @return-entry ${umlAlias(id)}\n(${label})`]));
  const source = lines.flatMap((line, index) => entries.has(index) ? [entries.get(index)!, line] : [line]).join("\n");
  return { source, renderMapping: { mode: "native", elements, relationships,
    auxiliary: [...returnLabels].map(([id, label]) => ({ kind: "flow-connector", elementId: id, label, ownerId: nodes.get(id)?.actorOrLane })),
  } };
}
