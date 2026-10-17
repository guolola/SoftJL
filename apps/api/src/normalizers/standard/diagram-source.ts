// Converts validated ordinary models to native PlantUML primitives supported by the bundled renderer.
import { validateStandardModel, type StandardDiagramKind, type StandardModel } from "@uml-platform/contracts";

// Escape both separators so valid contract IDs remain distinct, safe PlantUML aliases.
const ref = (id: string) => `node_${id.replace(/[_-]/g, char => `_${char.charCodeAt(0).toString(16)}_`)}`;
// Labels cannot introduce source lines, HTML/image tags, aliases or class-body delimiters.
const label = (value: string) => value.replace(/[\r\n]/g, " ").replace(/\\/g, "\\\\").replace(/["<>!%${}]/g, char => `&#${char.charCodeAt(0)};`);
const quote = (value: string) => `"${label(value)}"`;

export function standardDiagramSource(kind: StandardDiagramKind, input: StandardModel): string {
  const model = validateStandardModel(kind, input);
  const lines = ["@startuml", "skinparam backgroundColor transparent", "skinparam shadowing false"];
  if (kind === "sequence") return [...lines, "hide footbox",
    ...model.nodes.map(node => `participant ${quote(node.label)} as ${ref(node.id)}`),
    ...model.edges.map(edge => `${ref(edge.from)} ${edge.relation === "return" ? "-->" : "->"} ${ref(edge.to)}: ${label(edge.label)}`),
    "@enduml",
  ].join("\n");
  lines.push("allowmixing", "hide empty members", kind === "function" || kind === "activity" ? "top to bottom direction" : "left to right direction");
  if (kind === "activity") lines.push("skinparam rectangleRoundCorner 18");
  if (kind === "class" || kind === "table") lines.push("skinparam classAttributeIconSize 0");
  const renderNode = (node: StandardModel["nodes"][number]) => {
    const alias = ref(node.id);
    if (kind === "class" || kind === "table") {
      lines.push(`${kind === "table" ? "entity" : "class"} ${quote(node.label)} as ${alias} {`,
        ...node.fields.map(field => `  ${label(field)}`),
        ...(node.methods.length ? ["  --", ...node.methods.map(method => `  ${label(method)}`)] : []), "}");
    } else if (node.type === "start") lines.push(`circle " " as ${alias} #black`);
    else if (node.type === "end") lines.push(`usecase "<size:18>●</size>" as ${alias}`);
    else if (node.type === "decision") lines.push(`diamond ${quote(node.label)} as ${alias}`);
    else if (node.type === "action") lines.push(`rectangle ${quote(node.label)} as ${alias} <<action>>`);
    else lines.push(`${node.type === "actor" ? "actor" : node.type === "usecase" ? "usecase" : "rectangle"} ${quote(node.label)} as ${alias}`);
    if (kind === "er") node.fields.forEach((field, index) => {
      const attr = `attr_${ref(node.id)}_${index}`;
      lines.push(`usecase ${quote(field)} as ${attr}`, `${alias} -- ${attr}`);
    });
  };
  if (kind === "usecase") {
    model.nodes.filter(node => node.type === "actor").forEach(renderNode);
    lines.push('rectangle "系统" as system_boundary {');
    model.nodes.filter(node => node.type === "usecase").forEach(renderNode);
    lines.push("}");
  } else if (kind === "activity" && model.swimlanes?.length) {
    // Keep lane ownership visible in PlantUML while leaving every flow edge explicit below.
    for (const lane of model.swimlanes) {
      lines.push(`rectangle ${quote(lane.name)} as lane_${ref(lane.id)} <<partition>> {`);
      model.nodes.filter(node => node.actorOrLane === lane.id).forEach(renderNode);
      lines.push("}");
    }
    model.nodes.filter(node => !node.actorOrLane).forEach(renderNode);
  } else model.nodes.forEach(renderNode);
  model.edges.forEach((edge, index) => {
    if (kind === "er") {
      const relation = `relation_${index}`;
      lines.push(`diamond ${quote(edge.label || "关联")} as ${relation}`,
        `${ref(edge.from)} ${quote(edge.fromCardinality!)} -- ${relation}`,
        `${relation} -- ${quote(edge.toCardinality!)} ${ref(edge.to)}`);
    } else {
      const arrows = { association: kind === "usecase" || kind === "table" || kind === "class" ? "--" : "-->", include: "..>", extend: "..>", inheritance: "--|>", composition: "*--", aggregation: "o--", return: "..>" };
      const from = `${ref(edge.from)}${edge.fromCardinality ? ` ${quote(edge.fromCardinality)}` : ""}`;
      const to = `${edge.toCardinality ? `${quote(edge.toCardinality)} ` : ""}${ref(edge.to)}`;
      const text = ["include", "extend"].includes(edge.relation) ? `«${edge.relation}» ${label(edge.label)}` : label(edge.label);
      lines.push(`${from} ${arrows[edge.relation]} ${to}${text ? ` : ${text}` : ""}`);
    }
  });
  return [...lines, "@enduml"].join("\n");
}

export function roleUseCaseView(model: StandardModel, actorId: string): StandardModel {
  const ids = new Set([actorId]);
  for (const edge of model.edges) {
    if (edge.from === actorId) ids.add(edge.to);
    if (edge.to === actorId) ids.add(edge.from);
  }
  // Include/extend chains belong to the actor's view; associations to other actors do not.
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of model.edges) if (["include", "extend", "inheritance"].includes(edge.relation) && (ids.has(edge.from) || ids.has(edge.to))) {
      if (!ids.has(edge.from) || !ids.has(edge.to)) changed = true;
      ids.add(edge.from); ids.add(edge.to);
    }
  }
  return { nodes: model.nodes.filter(node => ids.has(node.id)), edges: model.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to)) };
}
