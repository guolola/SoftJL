// Presents the capability cards once when entering a newly created quick-modeling project.
import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "lucide-react";
import { consumeProjectIntroduction } from "../../../shared/lib/project-introduction";
import { useRouteContentReady } from "../../../shared/lib/route-content-readiness";
import { Button } from "../../../shared/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";
import BentoGrid from "./home-demo/integration/intro/bento-grid-23";

export function QuickModelingIntroDialog({ projectId, contentRef }: { projectId: string; contentRef: RefObject<HTMLElement | null> }) {
  const { t } = useTranslation();
  const routeReady = useRouteContentReady();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; width: number }>();
  useLayoutEffect(() => {
    if (!routeReady || !contentRef.current) return;
    const content = contentRef.current;
    const update = () => {
      const bounds = content.getBoundingClientRect();
      if (bounds.width > 0) setPosition({ left: bounds.left + bounds.width / 2, width: Math.max(0, bounds.width - 32) });
    };
    update();
    // Resizing or collapsing the sidebar changes the content area's center independently of the viewport.
    const observer = new ResizeObserver(update);
    observer.observe(content);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [contentRef, routeReady]);

  useEffect(() => {
    if (routeReady && consumeProjectIntroduction(projectId, "standard")) setOpen(true);
  }, [projectId, routeReady]);

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent showCloseButton={false} style={position} className="max-h-[90svh] overflow-y-auto sm:max-w-7xl">
      <DialogHeader className="pr-10">
        <DialogTitle>{t("standardProject.intro.dialog.title")}</DialogTitle>
        <DialogDescription>{t("standardProject.intro.dialog.description")}</DialogDescription>
      </DialogHeader>
      <DialogClose aria-label={t("standardProject.intro.dialog.close")} render={<Button variant="ghost" size="icon-sm" className="absolute right-4 top-4" />}><XIcon /></DialogClose>
      <div className="agent-feature-showcase" data-testid="agent-feature-showcase"><BentoGrid /></div>
      <DialogFooter>
        <DialogClose render={<Button />}>{t("standardProject.intro.dialog.start")}</DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
