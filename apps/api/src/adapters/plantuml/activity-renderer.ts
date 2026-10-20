// Draws activity nodes and pins explicitly so object flows never invent control sequencing.
import type { ActivityDiagramSpec, ActivityNode } from "@uml-platform/contracts";
import { umlAlias, umlLabel, umlText } from "./plantuml-text.js";

export function renderActivityGraph(model: ActivityDiagramSpec): string {
  const lines = ["@startuml", "allowmixing", "top to bottom direction", "hide stereotype", "skinparam shadowing false", "skinparam rectangle {", "  RoundCorner<<action>> 20", "  BackgroundColor<<bar>> black", "  BorderColor<<bar>> black", "  FontSize<<bar>> 1", "  Padding<<bar>> 0", "}"];
  const renderNode = (node: ActivityNode) => {
    const id = umlAlias(node.id);
    switch (node.type) {
      case "start": lines.push(`circle " " as ${id} #black`); break;
      // PlantUML's circle label sits outside its shape; use an ellipse with a centered symbol instead.
      case "end": lines.push(`usecase "<size:18>●</size>" as ${id}`); break;
      case "flow_final": lines.push(`usecase "<size:18>×</size>" as ${id}`); break;
      case "decision": case "merge":
        // The <> shorthand omits SVG node identities; explicit diamonds preserve both UML shape and mapping.
        lines.push(`diamond " " as ${id}`);
        if (node.type === "decision" && (node.question || node.name)) lines.push(`note right of ${id} : ${umlText(node.question || node.name || "")}`);
        break;
      case "fork": case "join": lines.push(`rectangle "<size:1>${"━".repeat(128)}</size>" as ${id} <<bar>>`); break;
      case "object": lines.push(`rectangle ${umlLabel(`${node.name}: ${node.dataType}${node.state ? `\n[${node.state}]` : ""}`)} as ${id} <<object>>`); break;
      case "activity": {
        const pins = [...(node.inputPins ?? []).map((pin) => ({ ...pin, direction: "portin" })), ...(node.outputPins ?? []).map((pin) => ({ ...pin, direction: "portout" }))];
        lines.push(`rectangle ${umlLabel(node.name)} as ${id} <<action>>${pins.length ? " {" : ""}`);
        for (const pin of pins) lines.push(`  ${pin.direction} ${umlLabel(`${pin.name}: ${pin.dataType}${pin.multiplicity ? ` [${pin.multiplicity}]` : ""}`)} as ${umlAlias(pin.id)}`);
        if (pins.length) lines.push("}");
        const annotations = [...(node.input ?? []).map((value) => `输入说明：${value}`), ...(node.output ?? []).map((value) => `输出说明：${value}`)];
        if (annotations.length) lines.push(`note right of ${id} : ${annotations.map(umlText).join("\\n")}`);
        break;
      }
    }
  };
  // Partitions group ownership only. Every business edge below comes from an explicit model edge.
  for (const lane of model.swimlanes) {
    lines.push(`rectangle ${umlLabel(lane.name)} as lane_${umlAlias(lane.id)} <<partition>> {`);
    for (const node of model.nodes.filter((node) => node.actorOrLane === lane.id)) renderNode(node);
    lines.push("}");
  }
  for (const node of model.nodes.filter((node) => !node.actorOrLane)) renderNode(node);
  for (const edge of model.relationships) {
    const semantics = [edge.type === "object_flow" ? "«object flow»" : "", edge.guard && `[${edge.guard}]`, edge.condition && `[${edge.condition}]`, edge.trigger].filter(Boolean).map((value) => umlText(String(value)));
    // Preserve edge identity even when several guards connect the same pair of nodes.
    lines.push(`' @relationship ${umlAlias(edge.id)}`, `${umlAlias(edge.sourceId)} --> ${umlAlias(edge.targetId)}${semantics.length ? ` : ${semantics.join("\\n")}` : ""}`);
  }
  lines.push("@enduml");
  return lines.join("\n");
}
