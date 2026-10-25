// Owns phase-specific graph semantics shared by generation, rendering and manual editing.
import { validateSequenceLifecycle } from "./sequence-lifecycle.js";
import { contractFieldSchema, unknownContractFields } from "./model-json-schema.js";
import { useCaseParticipationGaps } from "./usecase-participation.js";
import {
  diagramModelSpecSchema, designDiagramModelSpecSchema, activityDiagramSpecSchema, contextDiagramSpecSchema,
  type DiagramModelSpec, type DesignDiagramModelSpec, type TableDiagramSpec,
} from "./models.js";

export type ModelingStage = "feasibility" | "requirements" | "design";
export type AnyDiagramModel = DiagramModelSpec | DesignDiagramModelSpec;
export interface ModelDiagnostic {
  modelId: string;
  diagramKind: string;
  code: string;
  path: string;
  responsePath?: string;
  /** Model-relative references that must remain consistent when this identifier changes. */
  relatedPaths?: string[];
  expectedSchema?: Record<string, unknown>;
  elementId?: string;
  severity: "error" | "warning";
  message: string;
}
export interface ModelGraphElement { id: string; kind: string; name: string; path: string; ownerId?: string; dataType?: string }

export function getStageModelSchemas(stage: ModelingStage) {
  if (stage === "feasibility") return [contextDiagramSpecSchema, activityDiagramSpecSchema];
  return stage === "design" ? designDiagramModelSpecSchema.options : diagramModelSpecSchema.options;
}

export function getStageModelSchema(stage: ModelingStage, kind: string) {
  return getStageModelSchemas(stage).find((schema) => schema.shape.diagramKind.value === kind);
}

/** IDs of nested columns are table-scoped; pin IDs are graph-scoped because edges reference them. */
export function getModelGraphElements(model: AnyDiagramModel): ModelGraphElement[] {
  const result: ModelGraphElement[] = [];
  const add = (items: Array<{ id: string; name?: string }>, collection: string, kind: string | ((item: any) => string)) => {
    items.forEach((item, i) => result.push({ id: item.id, name: item.name ?? item.id, kind: typeof kind === "string" ? kind : kind(item), path: `${collection}.${i}` }));
  };
  switch (model.diagramKind) {
    case "context": result.push({ id: model.system.id, name: model.system.name, kind: "system", path: "system" }); add(model.people, "people", "person"); add(model.externalSystems, "externalSystems", "external"); break;
    case "function": add(model.nodes, "nodes", "function"); break;
    case "usecase": add(model.actors, "actors", "actor"); add(model.useCases, "useCases", "usecase"); break;
    case "class": add(model.classes, "classes", "class"); add(model.interfaces, "interfaces", "interface"); add(model.enums, "enums", "enum"); break;
    case "activity":
      add(model.nodes, "nodes", (node) => node.type);
      break;
    case "analysis": case "sequence": add(model.participants, "participants", (node) => node.participantType); break;
    case "prototype": case "navigation": add(model.nodes, "nodes", (node) => node.nodeType); break;
    case "architecture": add(model.packages, "packages", "package"); add(model.components, "components", "component"); break;
    case "component": add(model.components, "components", "component"); add(model.interfaces, "interfaces", "interface"); break;
    case "deployment": add(model.nodes, "nodes", (node) => node.nodeType); add(model.databases, "databases", "execution-environment"); add(model.components, "components", "component"); add(model.artifacts, "artifacts", "artifact"); add(model.externalSystems, "externalSystems", "external"); break;
    case "table": add(model.tables, "tables", "table"); break;
  }
  return result;
}

/** A single endpoint matrix drives UI choices and the authoritative server validation. */
export function isModelRelationshipAllowed(kind: string, type: string, source: string, target: string): boolean {
  const both = (types: string[]) => types.includes(source) && types.includes(target);
  switch (kind) {
    case "context": return both(["system", "person", "external"]) && (source === "system" || target === "system");
    case "function": return type === "decomposition" && both(["function"]);
    case "usecase": return type === "association" ? (source === "actor" && target === "usecase") || (source === "usecase" && target === "actor") : type === "generalization" ? source === target && ["actor", "usecase"].includes(source) : ["include", "extend"].includes(type) && both(["usecase"]);
    case "class":
      if (type === "implementation") return source === "class" && target === "interface";
      if (type === "inheritance") return source === target && ["class", "interface"].includes(source);
      if (type === "dependency") return both(["class", "interface", "enum"]);
      return ["association", "aggregation", "composition"].includes(type) && both(["class", "interface"]);
    case "activity": {
      const controls = ["decision", "merge", "fork", "join"];
      return type === "control_flow" && ["start", "activity", ...controls].includes(source) && ["activity", "end", ...controls].includes(target);
    }
    case "analysis": case "sequence": return ["sync", "async", "return", "create", "destroy"].includes(type);
    case "prototype": case "navigation":
      if (type === "contains") return source === "module" && ["module", "screen", "entry-point"].includes(target);
      if (type === "depends-on") return source === "module" && target === "module";
      return ["navigation", "opens", "submits", "returns"].includes(type) && ["screen", "entry-point"].includes(source) && target === "screen";
    case "architecture": return type === "contains" ? source === "package" && ["package", "component"].includes(target) : ["dependency", "communication"].includes(type) && both(["package", "component"]);
    case "component": return ["provided-interface", "required-interface"].includes(type) ? source === "component" && target === "interface" : ["dependency", "composition", "communication"].includes(type) && both(["component"]);
    case "deployment": {
      const nodes = ["node", "device", "execution-environment", "external"];
      if (type === "deployment") return source === "artifact" && nodes.includes(target);
      if (type === "manifestation") return source === "artifact" && target === "component";
      if (type === "communication") return both(nodes);
      return type === "dependency" && both([...nodes, "artifact", "component"]);
    }
    case "table": return ["one-to-one", "one-to-many"].includes(type) && both(["table"]);
    default: return false;
  }
}

// Reference namespaces matter: a swimlane rename must not retarget a node with the same ID.
function identifierReferencePaths(model: AnyDiagramModel, declaration: string, id: string): string[] {
  const fields: Record<string, string[]> = {
    swimlanes: ["actorOrLane"], messages: ["messageIds", "startMessageId", "endMessageId"],
    fragments: ["parentFragmentId"], activations: [], relationships: [], systemBoundaries: ["systemBoundaryId"],
    participants: ["sourceId", "targetId", "participantId"], actors: ["sourceId", "targetId", "primaryActorId", "supportingActorIds"],
    packages: ["sourceId", "targetId", "packageId", "parentId"], nodes: ["sourceId", "targetId", "parentId"],
    tables: ["referenceTableId", "sourceTableId", "targetTableId"],
  };
  const column = /^tables\.(\d+)\.columns\./.exec(declaration);
  const extension = /^useCases\.(\d+)\.extensionPoints\./.exec(declaration);
  const branch = /^fragments\.(\d+)\.branches\./.exec(declaration);
  const keys = new Set(column ? ["columnIds", "referenceColumnIds", "sourceColumnIds", "targetColumnIds"] : extension ? ["extensionPointIds"] : branch ? ["parentBranchId"] : fields[declaration.split(".")[0]!] ?? ["sourceId", "targetId"]);
  const paths: string[] = [];
  const visit = (value: unknown, path: string, field = "", owner: Record<string, any> = {}) => {
    if (Array.isArray(value)) value.forEach((item, i) => visit(item, `${path}.${i}`, field, owner));
    else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) visit(item, path ? `${path}.${key}` : key, key, value);
    else if (value === id && keys.has(field)) {
      if (column && model.diagramKind === "table") {
        const tableId = model.tables[Number(column[1])]!.id;
        const local = path.startsWith(`tables.${column[1]}.`);
        if (!(field === "columnIds" && local || field === "referenceColumnIds" && owner.referenceTableId === tableId || field === "sourceColumnIds" && owner.sourceTableId === tableId || field === "targetColumnIds" && owner.targetTableId === tableId)) return;
      }
      if (extension && model.diagramKind === "usecase" && owner.targetId !== model.useCases[Number(extension[1])]!.id) return;
      if (branch && (model.diagramKind === "sequence" || model.diagramKind === "analysis") && owner.parentFragmentId !== model.fragments[Number(branch[1])]!.id) return;
      paths.push(path);
    }
  };
  visit(model, "");
  return paths;
}

export function validateModelSemantics(model: AnyDiagramModel, stage: ModelingStage): ModelDiagnostic[] {
  const issues: ModelDiagnostic[] = [];
  const report = (code: string, path: string, message: string, elementId?: string) => issues.push({ modelId: "modelId" in model ? model.modelId ?? model.diagramKind : model.diagramKind, diagramKind: model.diagramKind, code, path, message, elementId, severity: "error" });
  const schema = getStageModelSchema(stage, model.diagramKind);
  if (!schema) { report("stage-model", "diagramKind", "当前阶段不允许此模型类型"); return issues; }
  for (const path of unknownContractFields(schema, model)) report("unsupported-field", path, "此阶段模型不支持该字段，请明确修复，不会静默删除");
  const parsed = schema.safeParse(model);
  if (!parsed.success) { for (const issue of parsed.error.issues) report("contract", issue.path.join("."), issue.message); return issues; }
  model = parsed.data as AnyDiagramModel;
  const elements = getModelGraphElements(model);
  const byId = new Map(elements.map((element) => [element.id, element]));
  const unique = <T extends { id: string }>(items: T[], path: string | ((item: T, index: number) => string)) => {
    const ids = new Set<string>();
    items.forEach((item, i) => {
      if (ids.has(item.id)) {
        const declaration = `${typeof path === "string" ? `${path}.${i}` : path(item, i)}.id`;
        report("duplicate-id", declaration, `标识重复：${item.id}`, item.id);
        issues.at(-1)!.relatedPaths = identifierReferencePaths(model, declaration, item.id);
      }
      ids.add(item.id);
    });
  };
  const ref = (id: string | undefined, ids: Set<string>, path: string) => { if (id && !ids.has(id)) report("missing-reference", path, `引用不存在：${id}`, id); };
  // A table edit may carry an outdated display projection; validate its constraint-derived edges.
  const edges = model.diagramKind === "table" ? deriveTableModel(model).relationships : model.diagramKind === "sequence" || model.diagramKind === "analysis" ? model.messages : model.relationships;
  const edgeCollection = model.diagramKind === "sequence" || model.diagramKind === "analysis" ? "messages" : "relationships";
  // Graph and auxiliary IDs share one namespace; nested extension points and table columns are owner-scoped.
  const auxiliary = model.diagramKind === "usecase" ? model.systemBoundaries : model.diagramKind === "activity" ? model.swimlanes : model.diagramKind === "sequence" || model.diagramKind === "analysis" ? [...model.fragments, ...model.activations ?? []] : [];
  const auxiliaryPaths = model.diagramKind === "usecase" ? model.systemBoundaries.map((_, i) => `systemBoundaries.${i}`) : model.diagramKind === "activity" ? model.swimlanes.map((_, i) => `swimlanes.${i}`) : model.diagramKind === "sequence" || model.diagramKind === "analysis" ? [...model.fragments.map((_, i) => `fragments.${i}`), ...(model.activations ?? []).map((_, i) => `activations.${i}`)] : [];
  // Never expose the temporary concatenation's indexes as repair locations.
  const identifiers = [...elements, ...edges.map((item, i) => ({ id: item.id, path: `${edgeCollection}.${i}` })), ...auxiliary.map((item, i) => ({ id: item.id, path: auxiliaryPaths[i]! }))];
  unique(identifiers, item => item.path);
  const cyclic = (links: Array<{ sourceId: string; targetId: string }>, path: string) => {
    const children = new Map<string, string[]>();
    for (const edge of links) children.set(edge.sourceId, [...children.get(edge.sourceId) ?? [], edge.targetId]);
    const active = new Set<string>(), done = new Set<string>();
    const visit = (id: string): boolean => {
      if (active.has(id)) return true;
      if (done.has(id)) return false;
      active.add(id);
      if ((children.get(id) ?? []).some(visit)) return true;
      active.delete(id); done.add(id); return false;
    };
    if ([...children.keys()].some(visit)) report("hierarchy-cycle", path, "层级或继承关系不能形成环");
  };
  edges.forEach((edge, i) => {
    const sourceId = "sourceTableId" in edge ? edge.sourceTableId : edge.sourceId;
    const targetId = "targetTableId" in edge ? edge.targetTableId : edge.targetId;
    const source = byId.get(sourceId), target = byId.get(targetId);
    if (!source || !target) { report("missing-endpoint", `${edgeCollection}.${i}`, `关系端点不存在：${!source ? sourceId : targetId}`, edge.id); return; }
    const type = "type" in edge ? edge.type : "communication";
    if (!isModelRelationshipAllowed(model.diagramKind, type, source.kind, target.kind)) report("invalid-endpoints", `${edgeCollection}.${i}`, `${type} 不允许连接 ${source.kind} → ${target.kind}`, edge.id);
    const selfAllowed = ["class", "activity", "sequence", "analysis", "table", "prototype", "navigation"].includes(model.diagramKind) && !["contains", "inheritance", "implementation", "create", "destroy"].includes(type);
    if (sourceId === targetId && !selfAllowed) report("invalid-self-relation", `${edgeCollection}.${i}`, "此关系不允许自连接", edge.id);
  });

  switch (model.diagramKind) {
    case "function": {
      const incoming = new Map<string, number>();
      for (const edge of model.relationships) incoming.set(edge.targetId, (incoming.get(edge.targetId) ?? 0) + 1);
      if (model.nodes.filter((node) => !incoming.has(node.id)).length !== 1) report("tree-root", "nodes", "功能分解树必须有一个根节点");
      for (const [id, count] of incoming) if (count !== 1) report("tree-parent", "relationships", "每个子功能只能有一个父功能", id);
      cyclic(model.relationships, "relationships"); break;
    }
    case "usecase": {
      const boundaries = new Set(model.systemBoundaries.map((item) => item.id));
      const actors = new Set(model.actors.map((item) => item.id));
      model.useCases.forEach((item, i) => {
        if (boundaries.size && !item.systemBoundaryId) report("boundary-membership", `useCases.${i}.systemBoundaryId`, "请明确用例所属系统边界", item.id);
        ref(item.systemBoundaryId, boundaries, `useCases.${i}.systemBoundaryId`);
        ref(item.primaryActorId, actors, `useCases.${i}.primaryActorId`);
        item.supportingActorIds.forEach((id) => ref(id, actors, `useCases.${i}.supportingActorIds`));
        unique(item.extensionPoints ?? [], `useCases.${i}.extensionPoints`);
      });
      model.relationships.forEach((edge, i) => {
        const points = new Set(model.useCases.find((item) => item.id === edge.targetId)?.extensionPoints?.map((point) => point.id) ?? []);
        for (const id of edge.extensionPointIds ?? []) ref(id, points, `relationships.${i}.extensionPointIds`);
        if (edge.type !== "extend" && (edge.extensionPointIds?.length ?? 0)) report("extension-point-relation", `relationships.${i}`, "只有扩展关系可以引用扩展点", edge.id);
        if (edge.type === "extend" && !edge.extensionPointIds?.length) report("extension-point-required", `relationships.${i}.extensionPointIds`, "扩展关系必须引用基础用例的扩展点", edge.id);
      });
      const participation = useCaseParticipationGaps(model);
      for (const gap of participation.gaps) report("actor-participation", gap.path, `参与者 ${gap.actorId} 已声明参与用例 ${gap.useCaseId}，但没有对应的参与关系`, gap.useCaseId);
      for (const actor of participation.isolatedActors) if (!participation.gaps.some((gap) => gap.actorId === actor.id)) report("isolated-actor", `actors.${model.actors.indexOf(actor)}`, `角色 ${actor.name} 没有参与任何用例，请补齐有依据的关联`, actor.id);
      for (const item of participation.disconnectedCases) if (!participation.gaps.some((gap) => gap.useCaseId === item.id)) report("disconnected-usecase", `useCases.${model.useCases.indexOf(item)}`, `用例 ${item.name} 未连接到任何参与者或有参与者的用例上下文`, item.id);
      cyclic(model.relationships.filter((edge) => edge.type === "generalization"), "relationships"); break;
    }
    case "class": {
      cyclic(model.relationships.filter((edge) => edge.type === "inheritance"), "relationships");
      model.classes.forEach((item, i) => item.attributes.forEach((attribute, j) => {
        if (attribute.multiplicity && !validMultiplicity(attribute.multiplicity)) report("multiplicity", `classes.${i}.attributes.${j}.multiplicity`, "属性多重性必须为合法非负区间", item.id);
      }));
      if (stage !== "design") model.classes.forEach((item, i) => {
        // Business names such as AccountManager are not evidence of an implementation class.
        if (/^(?:service|controller|repository|technical-interface)$/i.test(item.stereotype ?? "")) report("analysis-implementation-detail", `classes.${i}.stereotype`, "领域概念模型不包含技术服务类，请在设计阶段表达", item.id);
      });
      model.relationships.forEach((edge, i) => {
        for (const field of ["sourceMultiplicity", "targetMultiplicity"] as const) {
          const value = edge[field];
          if (value && !validMultiplicity(value)) report("multiplicity", `relationships.${i}.${field}`, "多重性应为合法非负区间，例如 0..1、1、0..*，下界不能超过上界", edge.id);
        }
      }); break;
    }
    case "activity": {
      const lanes = new Set(model.swimlanes.map((item) => item.id));
      const initial = model.nodes.filter((node) => node.type === "start");
      if (!initial.length || (stage === "feasibility" && initial.length !== 1)) report("activity-initial", "nodes", stage === "feasibility" ? "可行性业务流程约定恰有一个起点" : "活动需要起点");
      if (!model.nodes.some((node) => node.type === "end")) report("activity-final", "nodes", "当前流程模型需要显式终止节点");
      model.nodes.forEach((node, i) => {
        ref(node.actorOrLane, lanes, `nodes.${i}.actorOrLane`);
        const incoming = model.relationships.filter((edge) => edge.targetId === node.id), outgoing = model.relationships.filter((edge) => edge.sourceId === node.id);
        if (node.type === "start" && incoming.length) report("initial-incoming", `nodes.${i}`, "起点不能有入边", node.id);
        if (node.type === "end" && outgoing.length) report("final-outgoing", `nodes.${i}`, "终止节点不能有出边", node.id);
        if (["decision", "fork"].includes(node.type) && (incoming.length !== 1 || outgoing.length < 2)) report("split-degree", `nodes.${i}`, "判断或分叉需要一个输入和至少两个输出", node.id);
        if (["merge", "join"].includes(node.type) && (incoming.length < 2 || outgoing.length !== 1)) report("join-degree", `nodes.${i}`, "合并或汇合需要至少两个输入和一个输出", node.id);
      });
      const reachable = new Set(initial.map((node) => node.id));
      let changed = true;
      while (changed) {
        changed = false;
        for (const edge of model.relationships) if (reachable.has(edge.sourceId) && !reachable.has(edge.targetId)) { reachable.add(edge.targetId); changed = true; }
      }
      for (const node of model.nodes) if (!reachable.has(node.id)) report("unreachable-node", "nodes", "节点不能从起点到达", node.id);
      break;
    }
    case "analysis": case "sequence": {
      const messageIds = new Set(model.messages.map((message) => message.id));
      const positions = new Map(model.messages.map((message, i) => [message.id, i]));
      const fragments = new Map(model.fragments.map((fragment) => [fragment.id, fragment]));
      const spans = new Map<string, [number, number]>();
      model.fragments.forEach((fragment, i) => {
        const indices = fragment.messageIds.map((id) => positions.get(id)).filter((index): index is number => index !== undefined).sort((a, b) => a - b);
        fragment.messageIds.forEach((id) => ref(id, messageIds, `fragments.${i}.messageIds`));
        if (!indices.length || new Set(indices).size !== indices.length || indices.at(-1)! - indices[0]! + 1 !== indices.length) report("fragment-range", `fragments.${i}`, "片段消息必须唯一且在消息序列中连续", fragment.id);
        if (indices.length) spans.set(fragment.id, [indices[0]!, indices.at(-1)!]);
        if (["alt", "par"].includes(fragment.type) && (fragment.branches?.length ?? 0) < 2) report("fragment-branches", `fragments.${i}.branches`, "alt/par 必须有至少两个显式分支", fragment.id);
        if (["opt", "loop"].includes(fragment.type) && (fragment.branches?.length ?? 0) > 1) report("fragment-branches", `fragments.${i}.branches`, "opt/loop 只有一个操作数，不能包含多个分支", fragment.id);
        unique(fragment.branches ?? [], `fragments.${i}.branches`);
        const branchMessages = (fragment.branches ?? []).flatMap((branch) => branch.messageIds);
        if (fragment.branches?.length && (new Set(branchMessages).size !== branchMessages.length || fragment.messageIds.some((id) => !branchMessages.includes(id)) || branchMessages.some((id) => !fragment.messageIds.includes(id)))) report("branch-membership", `fragments.${i}.branches`, "分支消息必须不重叠且完整覆盖所属片段", fragment.id);
        for (const branch of fragment.branches ?? []) {
          const indices = branch.messageIds.map((id) => positions.get(id)).filter((index): index is number => index !== undefined).sort((a, b) => a - b);
          if (indices.length && indices.at(-1)! - indices[0]! + 1 !== indices.length) report("branch-range", `fragments.${i}.branches`, "一个分支的消息必须连续", branch.id);
        }
        if (fragment.parentFragmentId) {
          const parent = fragments.get(fragment.parentFragmentId);
          if (!parent || parent.id === fragment.id || fragment.messageIds.some((id) => !parent.messageIds.includes(id))) report("fragment-parent", `fragments.${i}.parentFragmentId`, "子片段必须属于存在的父片段", fragment.id);
          if (parent?.branches?.length && !parent.branches.some((branch) => branch.id === fragment.parentBranchId && fragment.messageIds.every((id) => branch.messageIds.includes(id)))) report("fragment-parent-branch", `fragments.${i}.parentBranchId`, "子片段必须完整位于指定父分支中", fragment.id);
        } else if (fragment.parentBranchId) report("fragment-parent", `fragments.${i}.parentBranchId`, "父分支引用必须同时指定父片段", fragment.id);
      });
      cyclic(model.fragments.filter((item) => item.parentFragmentId).map((item) => ({ sourceId: item.parentFragmentId!, targetId: item.id })), "fragments");
      const ancestor = (child: string, parent: string) => {
        const visited = new Set<string>(); let current = fragments.get(child)?.parentFragmentId;
        while (current && !visited.has(current)) { if (current === parent) return true; visited.add(current); current = fragments.get(current)?.parentFragmentId; } return false;
      };
      for (let i = 0; i < model.fragments.length; i++) for (let j = i + 1; j < model.fragments.length; j++) {
        const left = model.fragments[i]!, right = model.fragments[j]!, a = spans.get(left.id), b = spans.get(right.id);
        if (a && b && a[0] <= b[1] && b[0] <= a[1] && !ancestor(left.id, right.id) && !ancestor(right.id, left.id)) report("fragment-overlap", "fragments", "重叠片段必须声明完整嵌套关系，不能交叉", left.id);
      }
      for (const activation of model.activations ?? []) {
        ref(activation.participantId, new Set(byId.keys()), "activations.participantId"); ref(activation.startMessageId, messageIds, "activations.startMessageId"); ref(activation.endMessageId, messageIds, "activations.endMessageId");
        if ((positions.get(activation.startMessageId) ?? -1) > (positions.get(activation.endMessageId) ?? -1)) report("activation-order", "activations", "激活结束不能早于开始", activation.id);
        for (const fragment of model.fragments) {
          const startOperand = fragment.branches?.find((branch) => branch.messageIds.includes(activation.startMessageId));
          const endOperand = fragment.branches?.find((branch) => branch.messageIds.includes(activation.endMessageId));
          if (startOperand?.id !== endOperand?.id) report("activation-branch", "activations", "激活必须在同一分支中结束，或从外部完整包围片段", activation.id);
          if (!fragment.branches?.length && fragment.messageIds.includes(activation.startMessageId) !== fragment.messageIds.includes(activation.endMessageId)) report("activation-branch", "activations", "激活不能只跨越条件或循环片段的一端", activation.id);
        }
      }
      const activations = model.activations ?? [];
      for (let i = 0; i < activations.length; i++) for (let j = i + 1; j < activations.length; j++) {
        const a = activations[i]!, b = activations[j]!;
        if (a.participantId !== b.participantId) continue;
        const startA = positions.get(a.startMessageId)!, endA = positions.get(a.endMessageId)!;
        const startB = positions.get(b.startMessageId)!, endB = positions.get(b.endMessageId)!;
        if ((startA < startB && startB <= endA && endA < endB) || (startB < startA && startA <= endB && endB < endA)) report("activation-overlap", "activations", "同一对象的激活区间应独立或完整嵌套，不能交叉", a.id);
      }
      // Structural errors must be repaired before walking the fragment tree.
      if (issues.length === 0) validateSequenceLifecycle(model, report);
      break;
    }
    case "prototype": case "navigation": {
      const containment = model.relationships.filter((edge) => edge.type === "contains");
      cyclic(containment, "relationships");
      for (const node of model.nodes) if (containment.filter((edge) => edge.targetId === node.id).length > 1) report("multiple-owners", "relationships", "界面节点只能有一个所属模块", node.id);
      break;
    }
    case "architecture": {
      const packages = new Set(model.packages.map((item) => item.id));
      model.packages.forEach((item, i) => ref(item.parentId, packages, `packages.${i}.parentId`));
      model.components.forEach((item, i) => ref(item.packageId, packages, `components.${i}.packageId`));
      const containment = model.packages.filter((item) => item.parentId).map((item) => ({ sourceId: item.parentId!, targetId: item.id }));
      cyclic(containment, "packages");
      model.relationships.filter((edge) => edge.type === "contains").forEach((edge) => {
        const parent = model.packages.find((item) => item.id === edge.targetId)?.parentId ?? model.components.find((item) => item.id === edge.targetId)?.packageId;
        if (parent !== edge.sourceId) report("containment-mismatch", "relationships", "包含关系必须与元素归属字段一致", edge.id);
      }); break;
    }
    case "component": {
      const ownership = model.relationships.filter((edge) => edge.type === "composition");
      cyclic(ownership, "relationships");
      for (const node of model.components) if (ownership.filter((edge) => edge.targetId === node.id).length > 1) report("multiple-owners", "relationships", "组件组合中的部件不能同时归属多个整体", node.id);
      break;
    }
    case "deployment": {
      const nodes = [...model.nodes, ...model.databases]; const nodeIds = new Set(nodes.map((item) => item.id));
      nodes.forEach((item, i) => ref(item.parentId, nodeIds, `nodes.${i}.parentId`));
      cyclic(nodes.filter((item) => item.parentId).map((item) => ({ sourceId: item.parentId!, targetId: item.id })), "nodes"); break;
    }
    case "table": {
      model.tables.forEach((table, i) => {
        const base = `tables.${i}`; unique(table.columns, `${base}.columns`); unique(table.relationalConstraints ?? [], `${base}.relationalConstraints`);
        const ids = new Set(table.columns.map((column) => column.id));
        const constraints = table.relationalConstraints ?? [];
        if (constraints.filter((constraint) => constraint.type === "primary-key").length !== 1) report("primary-key", base, "物理表必须声明一个主键约束，可包含多个字段", table.id);
        constraints.forEach((constraint, j) => {
          if (constraint.type === "check") return;
          constraint.columnIds.forEach((id) => ref(id, ids, `${base}.relationalConstraints.${j}.columnIds`));
          if (new Set(constraint.columnIds).size !== constraint.columnIds.length) report("key-columns", base, "约束字段不能重复", constraint.id);
          if (constraint.type === "primary-key" && table.columns.some((column) => constraint.columnIds.includes(column.id) && column.nullable)) report("nullable-primary-key", base, "主键字段不能允许空值", constraint.id);
          if (constraint.type === "foreign-key") {
            const target = model.tables.find((item) => item.id === constraint.referenceTableId);
            if (!target) { report("foreign-table", base, "外键引用的表不存在", constraint.id); return; }
            if (constraint.columnIds.length !== constraint.referenceColumnIds.length) report("foreign-arity", base, "复合外键两端字段数量必须相同", constraint.id);
            constraint.referenceColumnIds.forEach((id) => ref(id, new Set(target.columns.map((column) => column.id)), `${base}.relationalConstraints.${j}.referenceColumnIds`));
            const uniqueTarget = target.relationalConstraints?.some((key) => ["primary-key", "unique"].includes(key.type) && "columnIds" in key && sameSet(key.columnIds, constraint.referenceColumnIds));
            if (!uniqueTarget) report("foreign-unique-target", base, "外键必须引用主键或唯一约束", constraint.id);
            constraint.columnIds.forEach((id, k) => {
              const sourceType = table.columns.find((column) => column.id === id)?.dataType;
              const targetType = target.columns.find((column) => column.id === constraint.referenceColumnIds[k])?.dataType;
              if (sourceType && targetType && sourceType.toLowerCase() !== targetType.toLowerCase()) report("foreign-type", base, "外键与被引用字段类型必须一致", constraint.id);
            });
          }
        });
      }); break;
    }
  }
  return issues;
}

function sameSet(left: string[], right: string[]) { return left.length === right.length && left.every((id) => right.includes(id)); }

function validMultiplicity(value: string) {
  if (/^(\d+|\*)$/.test(value)) return true;
  const range = /^(\d+)\.\.(\d+|\*)$/.exec(value);
  return Boolean(range && (range[2] === "*" || BigInt(range[1]) <= BigInt(range[2])));
}

/** Constraint-derived flags and ER edges cannot drift from the authoritative relational constraints. */
export function deriveTableModel(model: TableDiagramSpec): TableDiagramSpec {
  const relationships: TableDiagramSpec["relationships"] = [];
  const tables = model.tables.map((table) => {
    const constraints = table.relationalConstraints ?? [];
    const primary = constraints.find((key) => key.type === "primary-key");
    const primaryIds = primary && "columnIds" in primary ? primary.columnIds : [];
    for (const key of constraints) if (key.type === "foreign-key") {
      const unique = constraints.some((candidate) => ["primary-key", "unique"].includes(candidate.type) && "columnIds" in candidate && candidate.columnIds.every((id) => key.columnIds.includes(id)));
      relationships.push({ id: `${table.id}.${key.id}`, type: unique ? "one-to-one" : "one-to-many", sourceTableId: key.referenceTableId, targetTableId: table.id, sourceColumnIds: key.referenceColumnIds, targetColumnIds: key.columnIds, sourceMultiplicity: table.columns.some((column) => key.columnIds.includes(column.id) && column.nullable) ? "0..1" : "1", targetMultiplicity: unique ? "0..1" : "0..*", identifying: key.columnIds.every((id) => primaryIds.includes(id)), label: key.name ?? key.id });
    }
    return { ...table, columns: table.columns.map((column) => {
      const fk = constraints.find((key) => key.type === "foreign-key" && key.columnIds.includes(column.id));
      return { ...column, isPrimaryKey: primaryIds.includes(column.id), isForeignKey: Boolean(fk), references: fk?.type === "foreign-key" && fk.columnIds.length === 1 ? { tableId: fk.referenceTableId, columnId: fk.referenceColumnIds[0]! } : undefined };
    }) };
  });
  return { ...model, tables, relationships };
}

export class ModelSemanticError extends Error {
  constructor(public readonly diagnostics: ModelDiagnostic[]) { super(diagnostics.map((issue) => `[${issue.code}] ${issue.responsePath ?? issue.path}: ${issue.message}`).join("\n")); this.name = "ModelSemanticError"; }
}

export function assertValidModel(model: AnyDiagramModel, stage: ModelingStage): void {
  const diagnostics = validateModelSemantics(model, stage);
  if (diagnostics.some((issue) => issue.severity === "error")) throw new ModelSemanticError(diagnostics);
}

/** Schema-only boundary for generation and its saved upstream inputs. */
export function validateModelStructure(value: unknown, stage: ModelingStage): ModelDiagnostic[] {
  const kind = value && typeof value === "object" && "diagramKind" in value ? String(value.diagramKind) : "unknown";
  const modelId = value && typeof value === "object" && "modelId" in value && typeof value.modelId === "string" ? value.modelId : kind;
  const ownerId = (path: string) => {
    let current: unknown = value, id: string | undefined;
    for (const key of path.split(".")) {
      if (!current || typeof current !== "object") break;
      if ("id" in current && typeof current.id === "string") id = current.id;
      current = (current as Record<string, unknown>)[key];
    }
    return id;
  };
  const schema = getStageModelSchema(stage, kind);
  const parsed = schema?.safeParse(value);
  if (!parsed?.success) return (parsed?.error.issues ?? [{ path: ["diagramKind"], message: "当前阶段不支持此模型" }]).map((issue) => ({ modelId, diagramKind: kind, code: "contract", path: issue.path.join("."), elementId: ownerId(issue.path.join(".")), message: issue.message, severity: "error", expectedSchema: schema ? contractFieldSchema(schema, value, issue.path.join(".")) : { type: "string", enum: getStageModelSchemas(stage).map(item => item.shape.diagramKind.value) } }));
  const unknown = schema ? unknownContractFields(schema, value).map((path): ModelDiagnostic => ({ modelId, diagramKind: kind, code: "unsupported-field", path, elementId: ownerId(path), message: "此阶段模型不支持该字段", severity: "error" })) : [];
  return unknown;
}

export function validateModelInput(value: unknown, stage: ModelingStage): ModelDiagnostic[] {
  const diagnostics = validateModelStructure(value, stage);
  const kind = value && typeof value === "object" && "diagramKind" in value ? String(value.diagramKind) : "unknown";
  const parsed = getStageModelSchema(stage, kind)?.safeParse(value);
  return parsed?.success ? [...diagnostics, ...validateModelSemantics(parsed.data as AnyDiagramModel, stage)] : diagnostics;
}
