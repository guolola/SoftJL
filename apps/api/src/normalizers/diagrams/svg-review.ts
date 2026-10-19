// Verifies identifiable SVG nodes and links against the deterministic rendering map.
import type { DiagramReviewFinding, ModelRenderMapping } from "@uml-platform/contracts";
import { SaxesParser } from "saxes";

export function verifySvgMapping(svg: string, mapping: ModelRenderMapping | undefined, modelId: string, diagramKind?: string) {
  if (diagramKind === "activity" && mapping && mapping.mode !== "explicit-graph") {
    throw new Error("Activity render mapping must use explicit-graph");
  }
  const findings: DiagramReviewFinding[] = [];
  // Current SVG identity uses the qualified names and generated entity IDs from the renderer.
  const groups: Array<Record<string, string> & { visibleText: string }> = [];
  const stack: typeof groups = [];
  let parseError = false;
  const parser = new SaxesParser({ xmlns: false });
  parser.on("opentag", (tag) => {
    if (tag.name === "g") { const group = { ...tag.attributes, visibleText: "" }; groups.push(group); stack.push(group); }
  });
  parser.on("text", (value) => { for (const group of stack) group.visibleText += value; });
  parser.on("closetag", (tag) => { if (tag.name === "g") stack.pop(); });
  parser.on("error", () => { parseError = true; });
  try { parser.write(svg).close(); } catch { parseError = true; }
  if (parseError) return { identifiable: false, findings, inconclusive: ["SVG 格式无法解析，绘制核对未完成"] };
  const identifiable = groups.some((group) => group["data-qualified-name"] || group["data-entity"] || group.id?.startsWith("elem_"));
  if (!identifiable || !mapping) return { identifiable: false, findings };
  if (groups.some((group) => group.class?.split(/\s+/).includes("entity") && !group["data-qualified-name"] && !group["data-entity"] && !group.id?.startsWith("elem_"))) {
    return { identifiable: true, findings, inconclusive: ["部分 SVG 节点没有可识别标记，无法确认是否缺少模型元素"] };
  }
  const identifiers = new Set<string>();
  const entityIds = new Map<string, Set<string>>();
  for (const group of groups) {
    const qualified = group["data-qualified-name"];
    // Aliases are unique in the generated source even when a boundary qualifies the SVG name.
    const names = [group["data-entity"], group.id, qualified, qualified?.split(".").at(-1)].filter((name): name is string => Boolean(name));
    for (const name of names) {
      identifiers.add(name);
      if (group.id || group["data-entity-uid"]) {
        const ids = entityIds.get(name) ?? new Set<string>();
        if (group.id) ids.add(group.id);
        if (group["data-entity-uid"]) ids.add(group["data-entity-uid"]);
        entityIds.set(name, ids);
      }
    }
  }
  const normalizedText = (text: string) => text.replace(/\s+/g, "");
  const ownerAliases = new Map([...mapping.elements, ...(mapping.auxiliary ?? []).filter((item) => item.elementId && item.alias)].map((item) => [item.elementId!, item.alias!]));
  for (const element of mapping.elements) {
    if (identifiers.has(element.alias) || identifiers.has(`elem_${element.alias}`)) {
      const matchingGroups = groups.filter((item) => item["data-entity"] === element.alias || item.id === `elem_${element.alias}` || item["data-qualified-name"]?.split(".").at(-1) === element.alias);
      const group = matchingGroups[0];
      const visibleText = matchingGroups.map((item) => item.visibleText).join("");
      const qualified = group?.["data-qualified-name"];
      const owner = element.ownerId && ownerAliases.get(element.ownerId);
      if (qualified && owner && qualified.split(".").at(-2) !== owner) findings.push({ id: `${modelId}:svg:owner:${element.elementId}`, layer: "render", category: "render_mismatch", code: "wrong-svg-owner", modelId, elementId: element.elementId,
        expected: owner, actual: qualified, evidence: [{ source: "svg-qualified-name", reference: element.alias, detail: qualified }], observation: `SVG 元素 ${element.label ?? element.elementId} 的归属与模型不一致`, verification: "verified", repairable: true });
      if (group && element.label && element.statement?.includes(element.label) && !normalizedText(visibleText).includes(normalizedText(element.label))) findings.push({ id: `${modelId}:svg:label:${element.elementId}`, layer: "render", category: "render_mismatch", code: "wrong-svg-element-label", modelId, elementId: element.elementId,
        expected: element.label, actual: visibleText, evidence: [{ source: "svg-visible-text", reference: element.alias, detail: element.statement }], observation: `SVG 元素 ${element.elementId} 的名称与模型不一致`, verification: "verified", repairable: true });
      continue;
    }
    findings.push({ id: `${modelId}:svg:element:${element.elementId}`, layer: "render", category: "render_mismatch", code: "missing-svg-element", modelId, elementId: element.elementId,
      expected: element.alias, actual: null, evidence: [{ source: "svg-entity-id", reference: element.alias, detail: element.statement ?? "模型声明" }],
      observation: `SVG 缺少模型元素 ${element.label ?? element.elementId}`, verification: "verified", repairable: true });
  }
  const links = groups.filter((group) => group.class?.split(/\s+/).some((name) => name === "link" || name === "message") || group.id?.startsWith("link_"));
  const aliases = new Map(mapping.elements.map((item) => [item.elementId, item.alias]));
  // Native mindmap renderers do not expose stable link identities; do not infer missing edges there.
  if (mapping.mode === "explicit-graph" || links.length || /data-entity-[12]=/.test(svg) ||
    ["context", "usecase", "class", "prototype", "navigation", "architecture", "component", "deployment", "table", "analysis", "sequence"].includes(diagramKind ?? "")) {
    const expected = mapping.relationships.filter((edge) => edge.statement && !/^\s*'/.test(edge.statement) && aliases.has(edge.sourceId) && aliases.has(edge.targetId));
    const used = new Set<number>();
    for (const edge of expected) {
      const source = aliases.get(edge.sourceId)!, target = aliases.get(edge.targetId)!;
      const sourceIds = new Set([source, `elem_${source}`, ...(entityIds.get(source) ?? [])]);
      const targetIds = new Set([target, `elem_${target}`, ...(entityIds.get(target) ?? [])]);
      const directed = diagramKind === "analysis" || diagramKind === "sequence" || Boolean(edge.symbol && !["--", "..", "<-->", "<..>"].includes(edge.symbol));
      const index = links.findIndex((link, i) => !used.has(i) &&
        ((sourceIds.has(link["data-entity-1"] ?? "") && targetIds.has(link["data-entity-2"] ?? "")) ||
          (!directed && targetIds.has(link["data-entity-1"] ?? "") && sourceIds.has(link["data-entity-2"] ?? "")) ||
          link.id === `link_${source}_${target}` || (!directed && link.id === `link_${target}_${source}`)));
      if (index >= 0) {
        used.add(index);
        const link = links[index]!;
        const symbol = edge.symbol ?? "";
        // ER cardinality bars (||..o|) are not UML inheritance arrowheads (<| or |>).
        const expectedType = diagramKind === "table" ? /[{}]/.test(symbol) ? "crowfoot" : "association" : /<\||\|>/.test(symbol) ? "extension" : symbol.includes("*") ? "composition" : /^o|o$/.test(symbol) ? "aggregation" : symbol === "--" ? "association" : /^(?:<?\.?\.?-+>?|\.\.>)$/.test(symbol) ? "dependency" : undefined;
        if (expectedType && link["data-link-type"] && expectedType !== link["data-link-type"]) findings.push({ id: `${modelId}:svg:symbol:${edge.relationshipId}`, layer: "render", category: "render_mismatch", code: "wrong-svg-relationship-symbol", modelId, relationshipId: edge.relationshipId,
          expected: expectedType, actual: link["data-link-type"], evidence: [{ source: "svg-link-type", reference: edge.relationshipId, detail: edge.statement! }], observation: `SVG 关系 ${edge.relationshipId} 的符号与模型不一致`, verification: "verified", repairable: true });
        if (edge.label && edge.statement?.includes(edge.label) && !normalizedText(link.visibleText).includes(normalizedText(edge.label))) findings.push({ id: `${modelId}:svg:label:${edge.relationshipId}`, layer: "render", category: "render_mismatch", code: "wrong-svg-relationship-label", modelId, relationshipId: edge.relationshipId,
          expected: edge.label, actual: link.visibleText, evidence: [{ source: "svg-visible-text", reference: edge.relationshipId, detail: edge.statement }], observation: `SVG 关系 ${edge.relationshipId} 的标签与模型不一致`, verification: "verified", repairable: true });
        continue;
      }
      findings.push({ id: `${modelId}:svg:relationship:${edge.relationshipId}`, layer: "render", category: "render_mismatch", code: "missing-svg-relationship", modelId, relationshipId: edge.relationshipId,
        expected: `${source} → ${target}`, actual: null, evidence: [{ source: "svg-link-id", reference: edge.relationshipId, detail: edge.statement! }],
        observation: `SVG 缺少模型关系 ${edge.relationshipId}`, verification: "verified", repairable: true });
    }
  }
  return { identifiable: true, findings };
}
