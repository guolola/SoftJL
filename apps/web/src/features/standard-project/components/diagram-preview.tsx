// Shows stored SVGs through assistant-ui Diagram controls without executing SVG markup in the page.
import { useState } from "react";
import type { StandardDiagram } from "@uml-platform/contracts";
import { useTranslation } from "react-i18next";
import { Diagram } from "./elements/diagram";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../../../shared/ui/dialog";
import { Button } from "../../../shared/ui/button";

export function DiagramPreview({ diagram, onOpen }: { diagram: StandardDiagram; onOpen?: () => void }) {
  const [zoom, setZoom] = useState(1); const [expanded, setExpanded] = useState(false); const { t } = useTranslation();
  const preview = (large: boolean) => <Diagram title={diagram.title} zoom={zoom} onZoomIn={() => setZoom(value => Math.min(4, value + .25))} onZoomOut={() => setZoom(value => Math.max(.25, value - .25))}
    onReset={() => setZoom(1)} onExpand={large ? undefined : () => setExpanded(true)} className="max-w-none">
    <img className="block h-auto w-full rounded bg-white" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(diagram.svg!)}`} alt={diagram.title} loading="lazy" />
  </Diagram>;
  return <div className="min-w-0 space-y-1">{preview(false)}
    {onOpen && <Button variant="link" size="sm" onClick={onOpen}>{t("standardProject.preview.openEditor")}</Button>}
    <Dialog open={expanded} onOpenChange={setExpanded}><DialogContent className="max-h-[90svh] overflow-auto sm:max-w-[90vw]">
      <DialogTitle className="pr-8">{diagram.title}</DialogTitle><DialogDescription className="sr-only">{t("standardProject.preview.description")}</DialogDescription>
      {preview(true)}
    </DialogContent></Dialog>
  </div>;
}
