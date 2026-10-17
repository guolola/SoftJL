// Adapts ordinary Markdown and diagram snapshots to the shared styled DOCX renderer.
import type { StandardProjectState, DocumentSection } from "@uml-platform/contracts";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import { renderDocumentBuffer } from "../render/document-renderer.js";

export function standardDocumentSections(markdown: string, title: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let current: DocumentSection = { level: 1, title, body: [] };
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      if (current.body.length) sections.push(current);
      current = { level: Math.min(heading[1]!.length, 3) as 1 | 2 | 3, title: heading[2]!, body: [] };
      sections.push(current);
    } else if (line.trim()) {
      if (!sections.includes(current)) sections.push(current);
      current.body.push(line.replace(/\*\*(.*?)\*\*/g, "$1"));
    }
  }
  return [...new Set(sections)].length ? [...new Set(sections)] : [current];
}

export async function buildStandardDocument(state: StandardProjectState, kind: "requirementsSpec" | "softwareDesignSpec", render: PngRenderClient) {
  const document = state.documents?.[kind];
  if (!document) throw new Error("文档不存在");
  const sections = standardDocumentSections(document.markdown, document.title);
  const kinds = kind === "requirementsSpec" ? ["function", "usecase", "activity"] : ["architecture", "er", "class", "sequence", "table"];
  const sources = new Map<string, string>();
  const diagrams = (document.diagrams ?? Object.values(state.diagrams)).filter(item => item.status === "completed" && item.source && kinds.includes(item.kind));
  if (diagrams.length) sections.push({ level: 1, title: "模型图附录", body: [] });
  for (const diagram of diagrams) {
    sources.set(diagram.id, diagram.source!);
    sections.push({ level: 2, title: diagram.title, body: [], diagramKind: diagram.kind === "er" ? "class" : diagram.kind, diagramModelId: diagram.id });
  }
  // Ordinary projects share cover, numbering, fonts, contents and editor files with professional documents.
  const missing: string[] = [];
  const buffer = await renderDocumentBuffer(kind, sections, sources, new Set(sources.keys()), render, missing, document.documentStyle);
  if (missing.length) throw new Error(`文档图表渲染失败：${missing.join("；")}`);
  return buffer;
}
