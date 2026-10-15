// Deterministically renders validated models, preserving graph identity and recording emitted connections.
import {
  assertValidModel, deriveTableModel, getModelGraphElements,
  type AnyDiagramModel, type ModelingStage, type DiagramModelSpec, type DesignDiagramModelSpec,
  type PlantUmlArtifact, type DesignPlantUmlArtifact, type ClassAttribute, type ClassOperation,
  type SequenceDiagramSpec, type AnalysisSequenceDiagramSpec,
  type ModelRenderMapping,
} from "@uml-platform/contracts";
import { completeRenderMapping } from "./render-mapping.js";
import { renderActivityGraph } from "./activity-renderer.js";
import { umlAlias as alias, umlLabel as quote, umlText as text } from "./plantuml-text.js";

const symbols = { public: "+", protected: "#", private: "-", package: "~" };
const label = (parts: Array<string | undefined>) => parts.filter(Boolean).map((part) => text(part!)).join("\\n");
function attributeText(item: ClassAttribute) {
  return `${item.isStatic ? "{static} " : ""}${symbols[item.visibility]}${text(item.name)}: ${text(item.type)}${item.multiplicity ? ` [${text(item.multiplicity)}]` : ""}${item.required === false ? " {optional}" : ""}${item.defaultValue ? ` = ${text(item.defaultValue)}` : ""}${item.constraints?.length ? ` {${item.constraints.map(text).join("; ")}}` : ""}`;
}
function operationText(item: ClassOperation) {
  return `${item.isStatic ? "{static} " : ""}${item.isAbstract ? "{abstract} " : ""}${symbols[item.visibility]}${text(item.name)}(${item.parameters.map((parameter) => `${parameter.direction ? `${parameter.direction} ` : ""}${text(parameter.name)}: ${text(parameter.type)}${parameter.required === false ? "?" : ""}`).join(", ")})${item.returnType ? `: ${text(item.returnType)}` : ""}`;
}

function render(model: AnyDiagramModel, stage: ModelingStage) {
  assertValidModel(model, stage);
  if (model.diagramKind === "table") model = deriveTableModel(model);
  const lines: string[] = ["@startuml", "skinparam shadowing false"];
  const emitted = new Map<string, ModelRenderMapping["elements"][number]>();
  const connections = new Map<string, ModelRenderMapping["relationships"][number]>();
  const element = (id: string, statement: string) => {
    if (emitted.has(id)) throw new Error(`Duplicate rendering of ${id}`);
    emitted.set(id, { elementId: id, alias: alias(id), statement }); lines.push(statement);
  };
  const connection = (id: string, source: string, target: string, type: string, arrow: string, wording?: string, left?: string, right?: string) => {
    if (connections.has(id)) throw new Error(`Duplicate rendering of ${id}`);
    const statement = `${alias(source)}${left ? ` ${quote(left)}` : ""} ${arrow}${right ? ` ${quote(right)}` : ""} ${alias(target)}${wording ? ` : ${wording}` : ""}`;
    connections.set(id, { relationshipId: id, sourceId: source, targetId: target, type, symbol: arrow, statement });
    lines.push(statement);
  };
  const containment = (id: string, source: string, target: string, type: string) => {
    connections.set(id, { relationshipId: id, sourceId: source, targetId: target, type });
    lines.push(`' @containment ${alias(source)} ${alias(target)}`);
  };
  switch (model.diagramKind) {
    case "context":
      element(model.system.id, `rectangle ${quote(model.system.name)} as ${alias(model.system.id)} <<System>>`);
      model.people.forEach((item) => element(item.id, `actor ${quote(item.name)} as ${alias(item.id)}`));
      model.externalSystems.forEach((item) => element(item.id, `rectangle ${quote(item.name)} as ${alias(item.id)} <<External>>`));
      model.relationships.forEach((edge) => connection(edge.id, edge.sourceId, edge.targetId, "communication", edge.direction === "bidirectional" ? "<-->" : "-->", text(edge.label)));
      break;
    case "function": {
      lines.splice(0, lines.length, "@startmindmap");
      const children = new Set(model.relationships.map((edge) => edge.targetId));
      const visit = (id: string, depth: number) => {
        const node = model.nodes.find((node) => node.id === id)!;
        element(id, `' @element ${alias(id)}\n${"*".repeat(depth)} ${text(node.name).replace(/\*/g, "~*")}`);
        for (const edge of model.relationships.filter((edge) => edge.sourceId === id)) { containment(edge.id, id, edge.targetId, edge.type); visit(edge.targetId, depth + 1); }
      };
      visit(model.nodes.find((node) => !children.has(node.id))!.id, 1);
      break;
    }
    case "usecase": {
      lines.push("left to right direction");
      model.actors.forEach((item) => element(item.id, `actor ${quote(item.name)} as ${alias(item.id)}`));
      const drawCase = (item: typeof model.useCases[number]) => {
        element(item.id, `usecase ${quote(item.name)} as ${alias(item.id)}`);
        if (item.extensionPoints?.length) lines.push(`note right of ${alias(item.id)} : 扩展点\\n${item.extensionPoints.map((point) => text(point.name)).join("\\n")}`);
      };
      for (const boundary of model.systemBoundaries) {
        element(boundary.id, `rectangle ${quote(boundary.name)} as ${alias(boundary.id)} {`);
        model.useCases.filter((item) => item.systemBoundaryId === boundary.id).forEach(drawCase); lines.push("}");
      }
      model.useCases.filter((item) => !item.systemBoundaryId).forEach(drawCase);
      model.relationships.forEach((edge) => connection(edge.id, edge.sourceId, edge.targetId, edge.type, { association: "--", include: "..>", extend: "..>", generalization: "--|>" }[edge.type], label([edge.type === "include" || edge.type === "extend" ? `<<${edge.type}>>` : undefined, edge.label, edge.condition && `[${edge.condition}]`, edge.extensionPointIds?.length ? `扩展点：${edge.extensionPointIds.join(", ")}` : undefined])));
      break;
    }
    case "class": {
      for (const item of model.classes) {
        element(item.id, `${item.isAbstract ? "abstract class" : "class"} ${quote(item.name)} as ${alias(item.id)}${item.stereotype ? ` <<${text(item.stereotype)}>>` : ""} {`);
        lines.push(...item.attributes.map((attribute) => `  ${attributeText(attribute)}`), ...item.operations.map((operation) => `  ${operationText(operation)}`), "}");
        if (item.constraints?.length) lines.push(`note right of ${alias(item.id)} : ${item.constraints.map(text).join("\\n")}`);
      }
      for (const item of model.interfaces) { element(item.id, `interface ${quote(item.name)} as ${alias(item.id)} {`); lines.push(...item.operations.map(operationText), "}"); }
      for (const item of model.enums) { element(item.id, `enum ${quote(item.name)} as ${alias(item.id)} {`); lines.push(...item.literals.map(text), "}"); }
      for (const edge of model.relationships) {
        let arrow = { association: "--", aggregation: "o--", composition: "*--", inheritance: "--|>", implementation: "..|>", dependency: "..>" }[edge.type];
        if (["association", "aggregation", "composition"].includes(edge.type)) {
          if (edge.type === "association" && ["target-to-source", "bidirectional"].includes(edge.navigability ?? "")) arrow = "<" + arrow;
          if (["source-to-target", "bidirectional"].includes(edge.navigability ?? "")) arrow += ">";
        }
        connection(edge.id, edge.sourceId, edge.targetId, edge.type, arrow, edge.label && text(edge.label), [edge.sourceMultiplicity, edge.sourceRole, edge.type !== "association" && ["aggregation", "composition"].includes(edge.type) && ["target-to-source", "bidirectional"].includes(edge.navigability ?? "") ? "{navigable}" : undefined].filter(Boolean).join(" "), [edge.targetMultiplicity, edge.targetRole].filter(Boolean).join(" "));
      }
      break;
    }
    case "activity": {
      const source = renderActivityGraph(model);
      // Verify the explicit renderer emitted declarations and the actual edge statement, not just labels.
      for (const item of getModelGraphElements(model)) {
        if (!source.includes(`as ${alias(item.id)}`) && !source.includes(`<> ${alias(item.id)}`)) throw new Error(`Activity rendering omitted ${item.id}`);
        emitted.set(item.id, { elementId: item.id, alias: alias(item.id) });
      }
      for (const edge of model.relationships) {
        if (!source.includes(`${alias(edge.sourceId)} --> ${alias(edge.targetId)}`)) throw new Error(`Activity rendering omitted ${edge.id}`);
        connections.set(edge.id, { relationshipId: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, type: edge.type });
      }
      return { source, renderMapping: completeRenderMapping(model, source, { elements: [...emitted.values()], relationships: [...connections.values()], mode: "explicit-graph" }) };
    }
    case "analysis": case "sequence": {
      renderSequence(model, lines, element, connection); break;
    }
    case "prototype": case "navigation": {
      lines.push("left to right direction");
      const drawNode = (node: typeof model.nodes[number]) => {
        const children = model.relationships.filter((edge) => edge.type === "contains" && edge.sourceId === node.id);
        element(node.id, `${node.nodeType === "module" ? "package" : "rectangle"} ${quote([node.name, node.route].filter(Boolean).join("\n"))} as ${alias(node.id)} <<${node.nodeType}>>${children.length ? " {" : ""}`);
        for (const child of children) drawNode(model.nodes.find((item) => item.id === child.targetId)!);
        if (children.length) lines.push("}");
      };
      const owned = new Set(model.relationships.filter((edge) => edge.type === "contains").map((edge) => edge.targetId));
      model.nodes.filter((node) => !owned.has(node.id)).forEach(drawNode);
      for (const edge of model.relationships) {
        if (edge.type === "contains") { containment(edge.id, edge.sourceId, edge.targetId, edge.type); continue; }
        connection(edge.id, edge.sourceId, edge.targetId, edge.type, edge.type === "depends-on" ? "..>" : "-->", label([edge.label ?? edge.type, edge.trigger, edge.condition && `[${edge.condition}]`, edge.guard && `[${edge.guard}]`]));
      }
      break;
    }
    case "architecture": {
      const drawComponent = (item: typeof model.components[number]) => element(item.id, `component ${quote(item.name)} as ${alias(item.id)}`);
      const drawPackage = (item: typeof model.packages[number]) => {
        element(item.id, `package ${quote(item.name)} as ${alias(item.id)} {`);
        model.packages.filter((child) => child.parentId === item.id).forEach(drawPackage);
        model.components.filter((child) => child.packageId === item.id).forEach(drawComponent); lines.push("}");
      };
      model.packages.filter((item) => !item.parentId).forEach(drawPackage);
      model.components.filter((item) => !item.packageId).forEach(drawComponent);
      for (const edge of model.relationships) edge.type === "contains" ? containment(edge.id, edge.sourceId, edge.targetId, edge.type) : connection(edge.id, edge.sourceId, edge.targetId, edge.type, edge.type === "dependency" ? "..>" : "-->", edge.label && text(edge.label));
      break;
    }
    case "component": {
      lines.push("allowmixing");
      for (const item of model.components) element(item.id, `component ${quote(item.name)} as ${alias(item.id)}`);
      for (const item of model.interfaces) { element(item.id, `class ${quote(item.name)} as ${alias(item.id)} <<interface>> {`); lines.push(...item.operationNames.map(text), "}"); }
      for (const edge of model.relationships) connection(edge.id, edge.sourceId, edge.targetId, edge.type, { "provided-interface": "..|>", "required-interface": "..>", dependency: "..>", composition: "*--", communication: "-->" }[edge.type], label([edge.type === "required-interface" ? "<<use>>" : undefined, edge.label]));
      break;
    }
    case "deployment": {
      const nodes = [...model.nodes, ...model.databases];
      const drawNode = (node: typeof nodes[number]) => {
        const kind = "nodeType" in node ? node.nodeType : "execution-environment";
        const detail = "nodeType" in node ? [node.technology, node.environment] : [node.engine];
        element(node.id, `node ${quote([node.name, ...detail].filter(Boolean).join("\n"))} as ${alias(node.id)} <<${kind === "execution-environment" ? "executionEnvironment" : kind}>> {`);
        nodes.filter((child) => child.parentId === node.id).forEach(drawNode); lines.push("}");
      };
      nodes.filter((node) => !node.parentId).forEach(drawNode);
      model.components.forEach((item) => element(item.id, `component ${quote(item.name)} as ${alias(item.id)}`));
      model.artifacts.forEach((item) => element(item.id, `artifact ${quote(item.name)} as ${alias(item.id)}`));
      model.externalSystems.forEach((item) => element(item.id, `node ${quote(item.name)} as ${alias(item.id)} <<external>>`));
      for (const edge of model.relationships) {
        const arrow = edge.type === "communication" ? edge.direction === "two-way" ? "<-->" : edge.direction === "inbound" ? "<--" : "-->" : "..>";
        connection(edge.id, edge.sourceId, edge.targetId, edge.type, arrow, label([edge.type === "deployment" ? "<<deploy>>" : edge.type === "manifestation" ? "<<manifest>>" : edge.type === "dependency" ? "<<dependency>>" : undefined, edge.label, edge.protocol, edge.port]));
      }
      break;
    }
    case "table": {
      lines.push("hide circle");
      for (const table of model.tables) {
        element(table.id, `entity ${quote(table.name)} as ${alias(table.id)} {`);
        for (const column of table.columns) lines.push(`  ${column.nullable ? "" : "* "}${text(column.name)} : ${text(column.dataType)}${column.isPrimaryKey ? " <<PK>>" : ""}${column.isForeignKey ? " <<FK>>" : ""}`);
        lines.push("}");
        const descriptions = table.relationalConstraints.map((key) => key.type === "check" ? `CHECK ${key.expression}` : key.type === "foreign-key" ? `FOREIGN KEY (${key.columnIds.join(", ")}) REFERENCES ${key.referenceTableId} (${key.referenceColumnIds.join(", ")})` : `${key.type.toUpperCase()} (${key.columnIds.join(", ")})`);
        const annotations = [...table.constraints, ...descriptions, ...table.columns.flatMap((column) => column.constraints.map((value) => `${column.name}: ${value}`))];
        if (annotations.length) lines.push(`note right of ${alias(table.id)} : ${annotations.map(text).join("\\n")}`);
      }
      for (const edge of model.relationships) connection(edge.id, edge.sourceTableId, edge.targetTableId, edge.type, (edge.sourceMultiplicity === "0..1" ? "|o" : "||") + (edge.identifying ? "--" : "..") + (edge.targetMultiplicity === "0..1" ? "o|" : "o{"), label([edge.label, `(${edge.sourceColumnIds?.join(", ")}) → (${edge.targetColumnIds?.join(", ")})`]));
      break;
    }
  }
  // Rendering coverage is checked on emitted operations before publishing source or SVG.
  for (const node of getModelGraphElements(model)) if (!emitted.has(node.id)) throw new Error(`Rendering omitted node ${node.id}`);
  const edges = model.diagramKind === "sequence" || model.diagramKind === "analysis" ? model.messages : model.relationships;
  for (const edge of edges) if (!connections.has(edge.id)) throw new Error(`Rendering omitted relationship ${edge.id}`);
  if (model.notes.length && model.diagramKind !== "function") lines.push(`legend bottom\n${model.notes.map(text).join("\n")}\nendlegend`);
  lines.push(model.diagramKind === "function" ? "@endmindmap" : "@enduml");
  const source = lines.join("\n");
  return { source, renderMapping: completeRenderMapping(model, source, { elements: [...emitted.values()], relationships: [...connections.values()], mode: "native" }) };
}

function renderSequence(
  model: SequenceDiagramSpec | AnalysisSequenceDiagramSpec, lines: string[],
  element: (id: string, statement: string) => void,
  connection: (id: string, source: string, target: string, type: string, arrow: string, wording?: string) => void,
) {
  lines.push("autonumber", `title ${quote(model.title)}`);
  for (const participant of model.participants) {
    const keyword = ["actor", "boundary", "control", "entity", "database"].includes(participant.participantType) ? participant.participantType : "participant";
    element(participant.id, `${keyword} ${quote(participant.name)} as ${alias(participant.id)}`);
  }
  const positions = new Map(model.messages.map((message, i) => [message.id, i]));
  const rendered = new Set<string>(), renderedFragments = new Set<string>();
  const messages = new Map(model.messages.map((message) => [message.id, message]));
  const renderRange = (ids: string[], parentId?: string, branchId?: string) => {
    const children = model.fragments.filter((fragment) => fragment.parentFragmentId === parentId && (!parentId || fragment.parentBranchId === branchId));
    const starts = new Map(children.map((fragment) => [[...fragment.messageIds].sort((a, b) => positions.get(a)! - positions.get(b)!)[0], fragment]));
    for (const id of [...ids].sort((a, b) => positions.get(a)! - positions.get(b)!)) {
      if (rendered.has(id)) continue;
      const fragment = starts.get(id);
      if (fragment) {
        if (renderedFragments.has(fragment.id)) throw new Error(`Duplicate fragment ${fragment.id}`);
        renderedFragments.add(fragment.id);
        const branches = fragment.branches?.length ? fragment.branches : [{ id: undefined, label: fragment.label, condition: fragment.condition, messageIds: fragment.messageIds }];
        branches.forEach((branch, i) => {
          lines.push(`${i === 0 ? fragment.type : "else"} ${label([i === 0 && fragment.branches?.length ? fragment.label : undefined, i === 0 && fragment.branches?.length && fragment.condition ? `[${fragment.condition}]` : undefined, branch.label, branch.condition && `[${branch.condition}]`])}`);
          renderRange(branch.messageIds, fragment.id, branch.id);
        }); lines.push("end");
      } else {
        const message = messages.get(id)!;
        if (message.type === "create") lines.push(`create ${alias(message.targetId)}`);
        connection(message.id, message.sourceId, message.targetId, message.type, message.type === "async" ? "->>" : message.type === "return" ? "-->" : "->", text(`${message.name}(${message.parameters.join(", ")})${message.returnValue ? `: ${message.returnValue}` : ""}${message.condition ? ` [${message.condition}]` : ""}`));
        // Open outer intervals first and close inner intervals first regardless of editor array order.
        for (const activation of (model.activations ?? []).filter((item) => item.startMessageId === id).sort((a, b) => positions.get(b.endMessageId)! - positions.get(a.endMessageId)!)) lines.push(`activate ${alias(activation.participantId)}`);
        for (const activation of (model.activations ?? []).filter((item) => item.endMessageId === id).sort((a, b) => positions.get(b.startMessageId)! - positions.get(a.startMessageId)!)) lines.push(`deactivate ${alias(activation.participantId)}`);
        if (message.type === "destroy") lines.push(`destroy ${alias(message.targetId)}`);
        rendered.add(id);
      }
    }
  };
  renderRange(model.messages.map((message) => message.id));
  if (rendered.size !== model.messages.length || renderedFragments.size !== model.fragments.length) throw new Error("Sequence rendering omitted messages or fragments");
}

export function generatePlantUmlArtifacts(models: DiagramModelSpec[], stage: "requirements" | "feasibility" = "requirements"): PlantUmlArtifact[] {
  return models.map((model) => ({ modelId: "modelId" in model ? model.modelId : undefined, diagramKind: model.diagramKind, ...render(model, stage) }));
}
export function generateDesignPlantUmlArtifacts(models: DesignDiagramModelSpec[]): DesignPlantUmlArtifact[] {
  return models.map((model) => ({ modelId: model.modelId, diagramKind: model.diagramKind, ...render(model, "design") }));
}
