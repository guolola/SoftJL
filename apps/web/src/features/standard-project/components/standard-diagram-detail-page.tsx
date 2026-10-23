// Composes ordinary models with the same detail header, canvas, overview and responsive editor as professional projects.
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StandardDiagram, StandardModel } from "@uml-platform/contracts";
import type { DiagramDetailItem } from "../../../entities/diagram/lib/model-details";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui/tabs";
import { DiagramDetailHeader } from "../../diagrams/components/diagram-detail-header";
import { DiagramPreviewPanel } from "../../diagrams/components/diagram-preview-panel";
import { useSvgPanZoom } from "../../diagrams/hooks/use-svg-pan-zoom";
import { sanitizeSvgMarkup } from "../../diagrams/lib/svg-sanitizer";
import { useCompactViewport } from "../../workspace-shell/hooks/use-compact-viewport";
import { mobileTouchTargetClass } from "../../workspace-shell/components/mobile-density";
import { buildStandardDiagramDetail } from "../lib/standard-diagram-detail";
import { StandardModelEditPanel } from "./standard-model-edit-panel";

export function StandardDiagramDetailPage({ diagram, disabled, canEdit, onSave }: {
  diagram: StandardDiagram; disabled: boolean; canEdit: boolean;
  onSave: (model: StandardModel) => Promise<boolean | undefined>;
}) {
  const { t } = useTranslation();
  const compact = useCompactViewport();
  const overviewId = useId();
  const [tab, setTab] = useState("diagram");
  const [overview, setOverview] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightRequest, setHighlightRequest] = useState(0);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const detail = useMemo(() => buildStandardDiagramDetail(diagram.model), [diagram.model]);
  const itemsById = new Map(detail.items.map(item => [item.id, item]));
  const highlighted = selectedId ? itemsById.get(selectedId) : undefined;
  const relationships = detail.relationships.filter(relation => relation.sourceId === selectedId || relation.targetId === selectedId);
  const relatedIds = new Set(relationships.flatMap(relation => [relation.sourceId, relation.targetId]));
  const svg = useMemo(() => sanitizeSvgMarkup(diagram.svg ?? ""), [diagram.svg]);
  const viewport = useSvgPanZoom(svg, svg);
  const selectElement = (item: DiagramDetailItem) => {
    setSelectedId(item.id); setHighlightRequest(value => value + 1); setOverview(true); setTab("diagram");
    viewport.svgCanvasRef.current?.scrollIntoView?.({ block: "nearest" });
  };
  const saveModel = async (model: StandardModel) => {
    if (disabled || !canEdit) return false;
    setSaveStatus("saving");
    try {
      const saved = await onSave(model);
      setSaveStatus(saved ? "saved" : "error");
      return saved;
    } catch { setSaveStatus("error"); return false; }
  };
  const editor = (section: "all" | "elements" | "relations" = "all") => <StandardModelEditPanel
    diagram={diagram} disabled={disabled} readOnly={!canEdit} section={section} selectedElement={highlighted}
    onSelectElement={selectElement} onSave={saveModel}
  />;
  return <div className="flex min-h-0 flex-1 flex-col py-4 lg:py-6">
    <div className="mx-auto flex min-h-0 w-[calc(100%-2rem)] max-w-348 flex-1 flex-col gap-4 sm:w-[calc(100%-3rem)]">
      <DiagramDetailHeader modelTitle={diagram.title} modelSummary={t(`standardProject.diagramKinds.${diagram.kind}`)}
        canEdit={false} saving={saveStatus === "saving"} saveStatus={saveStatus} saveStatusLabel={saveStatus === "saved" ? t("diagrams.detail.changesSaved") : saveStatus === "saving" ? t("diagrams.detail.savingAndUpdating") : saveStatus === "error" ? t("diagrams.detail.headerSaveFailed") : ""} compactViewport={compact}
        itemCount={detail.items.length} relationshipCount={detail.relationships.length} groupCount={detail.groups.length}
        onSaveMetadata={async () => false}
      />
      {diagram.error && <p role="alert" className="text-sm text-destructive">{diagram.error}</p>}
      <Tabs value={compact ? tab : "diagram"} onValueChange={setTab} className="min-w-0 flex-col gap-0">
        {compact && <div className="border-b border-border px-3 sm:px-5"><TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-none bg-transparent p-0 sm:gap-8">
          {(["diagram", "elements", "relations"] as const).map(value => <TabsTrigger key={value} value={value} className={`relative flex-none border-0 px-2 after:absolute after:inset-x-2 after:bottom-0 after:hidden after:h-0.5 data-active:after:block ${mobileTouchTargetClass}`}>{t(`diagrams.tabs.${value}`)}</TabsTrigger>)}
        </TabsList></div>}
        <TabsContent value="diagram" className="m-0 w-full min-w-0 p-0">
          <DiagramPreviewPanel stage="design" type={diagram.kind === "er" ? "class" : diagram.kind}
            diagramId={`standard:${diagram.id}`} exportFileStem={diagram.title} plantUmlSource={diagram.source ?? ""}
            normalizedSvgMarkup={svg} svgMarkup={svg} svgUrl={viewport.svgUrl} svgScale={viewport.svgScale}
            svgCanvasRef={viewport.svgCanvasRef} isPanning={viewport.isPanning} svgPanOffset={viewport.svgPanOffset}
            onUpdateSvgScale={viewport.updateSvgScale} onStartPan={viewport.startCanvasPan} onMovePan={viewport.moveCanvasPan} onStopPan={viewport.stopCanvasPan}
            highlighted={highlighted} highlightAliases={highlighted ? [highlighted.id, `n_${Array.from(new TextEncoder().encode(highlighted.id), byte => byte.toString(16).padStart(2, "0")).join("")}`] : []} highlightRequestId={highlightRequest}
            diagramError={diagram.error ? { error: diagram.error } : null} diagramLabel={diagram.title}
            isOverviewPanelOpen={overview} overviewPanelId={overviewId} compactViewport={compact}
            onOpenOverviewPanel={() => setOverview(true)} onCloseOverviewPanel={() => setOverview(false)} onFocusAction={() => setSelectedId(null)}
            sourceRuleIds={[]} relatedRelationships={relationships} relatedItems={detail.items.filter(item => item.id !== selectedId && relatedIds.has(item.id))}
            itemsById={itemsById} summaryGroups={detail.groups} relationshipsCount={detail.relationships.length}
          />
          {!compact && diagram.model && <div className="pt-4">{editor()}</div>}
        </TabsContent>
        {compact && <>
          <TabsContent value="elements" className="m-0 p-3 sm:p-5">{editor("elements")}</TabsContent>
          <TabsContent value="relations" className="m-0 p-3 sm:p-5">{editor("relations")}</TabsContent>
        </>}
      </Tabs>
    </div>
  </div>;
}
