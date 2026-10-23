// Renders the eight quick-modeling kinds using shared native renderers and an independent conceptual ER view.
import { validateStandardModel, type StandardDiagramKind, type StandardModel } from "@uml-platform/contracts";
import { generatePlantUmlArtifacts, generateDesignPlantUmlArtifacts } from "../../adapters/plantuml/model-renderer.js";
import { umlAlias, umlLabel } from "../../adapters/plantuml/plantuml-text.js";

// PlantUML's Unicode escape keeps a literal dollar out of both its preprocessor and label replacement regex.
const literalSymbol = (char: string) => char === "$" ? "<U+0024>" : `&#${char.charCodeAt(0)};`;

// Preserve quick modeling's literal-label boundary while leaving native identifiers and references intact.
function literalDisplayValues(value: unknown, key = ""): unknown {
  if (typeof value === "string") return /^(id|actorOrLane)$|Ids?$/.test(key) ? value : value
    .replace(/[\r\n]/g, " ").replace(/\\/g, "\\\\")
    .replace(/["<>&!%${}]/g, literalSymbol);
  if (Array.isArray(value)) return value.map(item => literalDisplayValues(item, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, literalDisplayValues(item, name)]));
  return value;
}

export function buildStandardDiagram(kind: StandardDiagramKind, input: unknown) {
  const model = validateStandardModel(kind, input);
  // Derived labels may include identifiers (for example unnamed foreign keys); cover those as well.
  const source = renderSource(literalDisplayValues(model) as StandardModel)
    .replace(/[!%$]/g, literalSymbol).replace(/<(?=img\b)/gi, "&#60;");
  return { model, source };
}

function renderSource(model: StandardModel): string {
  if (model.diagramKind === "function" || model.diagramKind === "usecase" || model.diagramKind === "activity") return generatePlantUmlArtifacts([model])[0]!.source;
  if (model.diagramKind !== "er") return generateDesignPlantUmlArtifacts([model])[0]!.source;
  const lines = ["@startuml", "skinparam shadowing false", "left to right direction", "allowmixing"];
  for (const [i, entity] of model.entities.entries()) {
    lines.push(`rectangle ${umlLabel(entity.name)} as ${umlAlias(entity.id)}`);
    for (const [j, attribute] of entity.attributes.entries()) {
      const alias = `attribute_${i}_${j}`;
      lines.push(`usecase ${umlLabel(attribute.isKey ? `<u>${attribute.name}</u>` : attribute.name)} as ${alias}`, `${umlAlias(entity.id)} -- ${alias}`);
    }
  }
  for (const [i, relation] of model.relationships.entries()) lines.push(`diamond ${umlLabel(relation.name)} as relation_${i}`,
    `${umlAlias(relation.sourceId)} ${umlLabel(relation.sourceMultiplicity)} -- relation_${i}`,
    `relation_${i} -- ${umlLabel(relation.targetMultiplicity)} ${umlAlias(relation.targetId)}`);
  return [...lines, "@enduml"].join("\n");
}
