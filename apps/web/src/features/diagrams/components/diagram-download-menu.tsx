// Downloads saved diagram artifacts and cancels conversion when their identity changes.
import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UmlDiagramKind } from "@uml-platform/contracts";
import { useWorkspaceRepository } from "../../../services/workspace-repository";
import { downloadBlobFile, downloadTextFile } from "../../../shared/lib/download";
import { Button } from "../../../shared/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../../../shared/ui/dropdown-menu";
import { floatingAlert } from "../../../shared/ui/floating-alert";

type Format = "svg" | "png" | "pdf" | "puml";

export function DiagramDownloadMenu({ diagramKind, diagramId, fileStem, svg, source }: {
  diagramKind: UmlDiagramKind; diagramId?: string; fileStem: string; svg: string; source: string;
}) {
  const { t } = useTranslation();
  const repository = useWorkspaceRepository();
  const active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const identity = JSON.stringify([diagramId, diagramKind, fileStem, svg, source]);
  const latest = useRef(identity);
  latest.current = identity;
  const sourceMissing = !source.trim();
  const reason = (format: Format) => {
    if (format === "svg") return !svg.trim() ? t("diagrams.detail.downloadNoSvg") : "";
    if (sourceMissing) return t("diagrams.detail.downloadNoSource");
    if (format !== "puml" && !repository.exportDiagram) return t("diagrams.detail.downloadUnsupported");
    return "";
  };

  useEffect(() => {
    const cancel = () => {
      active.current?.abort();
      active.current = null;
      setBusy(false);
    };
    cancel();
    window.addEventListener("uml-route-change", cancel);
    window.addEventListener("popstate", cancel);
    return () => {
      active.current?.abort();
      active.current = null;
      window.removeEventListener("uml-route-change", cancel);
      window.removeEventListener("popstate", cancel);
    };
  }, [identity, repository]);

  async function download(format: Format) {
    if (active.current || reason(format)) return;
    const filename = `${fileStem}.${format}`;
    if (format === "svg" || format === "puml") {
      downloadTextFile(filename, format === "svg" ? svg : source, format === "svg" ? "image/svg+xml" : "text/plain");
      floatingAlert.success(t("diagrams.detail.exported", { file: filename }));
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    try {
      // Capture the saved source at click time; never download a response for a different diagram.
      const blob = await repository.exportDiagram!({ diagramKind, plantUmlSource: source, format }, controller.signal);
      if (controller.signal.aborted || latest.current !== identity) return;
      downloadBlobFile(filename, blob);
      floatingAlert.success(t("diagrams.detail.exported", { file: filename }));
    } catch (error) {
      if (!controller.signal.aborted && latest.current === identity) {
        floatingAlert.error(t("diagrams.detail.downloadError", { error: error instanceof Error ? error.message : t("diagrams.detail.downloadFailed") }));
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }

  return <div className="flex shrink-0 flex-col gap-1">
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-11 px-2 sm:h-8 sm:px-3" />} disabled={busy} aria-label={t("diagrams.detail.download")}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        <span>{t(busy ? "diagrams.detail.downloadPreparing" : "diagrams.detail.download")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)]">
        {(["svg", "png", "pdf", "puml"] as const).map((format) => <DropdownMenuItem key={format} className="min-h-11 flex-col items-start justify-center gap-0.5" aria-label={format === "puml" ? "PlantUML" : format.toUpperCase()} aria-description={reason(format) || undefined} disabled={busy || Boolean(reason(format))} onClick={() => void download(format)}>
          <span>{format === "puml" ? "PlantUML" : format.toUpperCase()}</span>
          {reason(format) && <span className="text-xs text-muted-foreground">{reason(format)}</span>}
        </DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
    {busy && <span role="status" className="text-xs text-muted-foreground">{t("diagrams.detail.downloadPreparing")}</span>}
  </div>;
}
