// Owns SVG viewport object URL, zoom, and pointer-pan state for diagram detail views.
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

export function useSvgPanZoom(svgMarkup: string, normalizedSvgMarkup: string) {
  const [svgUrl, setSvgUrl] = useState("");
  const [svgScale, setSvgScale] = useState(1);
  const svgScaleRef = useRef(svgScale);
  const svgCanvasRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  });
  const [isPanning, setIsPanning] = useState(false);
  const [svgPanOffset, setSvgPanOffset] = useState({ x: 0, y: 0 });

  const updateSvgScale = useCallback((next: number) => {
    setSvgScale(Math.min(3, Math.max(0.25, Math.round(next * 100) / 100)));
  }, []);

  useEffect(() => {
    svgScaleRef.current = svgScale;
  }, [svgScale]);

  useEffect(() => {
    const canvas = svgCanvasRef.current;
    if (!canvas || !svgMarkup) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      updateSvgScale(svgScaleRef.current + (event.deltaY < 0 ? 0.1 : -0.1));
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [svgMarkup, updateSvgScale]);

  useEffect(() => {
    panStateRef.current.active = false;
    panStateRef.current.pointerId = null;
    setIsPanning(false);
    setSvgPanOffset({ x: 0, y: 0 });
  }, [svgMarkup]);

  const startCanvasPan = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if ((typeof event.button === "number" && event.button !== 0) || !svgMarkup) {
        return;
      }

      const canvas = svgCanvasRef.current;
      if (!canvas) return;

      event.preventDefault();
      canvas.setPointerCapture?.(event.pointerId);
      panStateRef.current = {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: svgPanOffset.x,
        offsetY: svgPanOffset.y,
      };
      window.getSelection()?.removeAllRanges();
      setIsPanning(true);
    },
    [svgMarkup, svgPanOffset.x, svgPanOffset.y],
  );

  const moveCanvasPan = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const panState = panStateRef.current;
    if (!panState.active || panState.pointerId !== event.pointerId) return;

    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    setSvgPanOffset({
      x: panState.offsetX + event.clientX - panState.startX,
      y: panState.offsetY + event.clientY - panState.startY,
    });
  }, []);

  const stopCanvasPan = useCallback((event?: PointerEvent<HTMLDivElement>) => {
    if (!panStateRef.current.active) return;

    if (event && panStateRef.current.pointerId !== event.pointerId) return;
    if (event) {
      svgCanvasRef.current?.releasePointerCapture?.(event.pointerId);
    }
    panStateRef.current.active = false;
    panStateRef.current.pointerId = null;
    setIsPanning(false);
  }, []);

  useEffect(() => {
    if (!normalizedSvgMarkup || typeof URL.createObjectURL !== "function") {
      setSvgUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(
      new Blob([normalizedSvgMarkup], { type: "image/svg+xml" }),
    );
    setSvgUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [normalizedSvgMarkup]);

  return {
    svgUrl,
    svgScale,
    svgCanvasRef,
    isPanning,
    svgPanOffset,
    updateSvgScale,
    startCanvasPan,
    moveCanvasPan,
    stopCanvasPan,
  };
}
