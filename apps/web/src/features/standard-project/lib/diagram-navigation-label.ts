// Removes a redundant diagram-kind suffix only in category-scoped navigation; stored titles remain unchanged.
import type { StandardDiagram } from "@uml-platform/contracts";
import { standardProjectZh, standardProjectEn } from "../../../shared/i18n/standard-project-resources";

export function diagramNavigationLabel(diagram: Pick<StandardDiagram, "kind" | "title">) {
  const title = diagram.title.trim();
  for (const label of [standardProjectZh.diagramKinds[diagram.kind], standardProjectEn.diagramKinds[diagram.kind]]) {
    if (!title.toLowerCase().endsWith(label.toLowerCase())) continue;
    const prefix = title.slice(0, -label.length);
    if (!/[·•—–\-:：|｜/]\s*$/.test(prefix)) continue;
    const business = prefix.replace(/\s*[·•—–\-:：|｜/]\s*$/, "").trim();
    if (business) return business;
  }
  return title;
}
