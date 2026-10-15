import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Alert } from '../../../shared/ui/alert';
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { i18n as appI18n } from "../../../shared/i18n/i18n";
import { sanitizeSvgMarkup } from "../lib/svg-sanitizer";

function parseSvgLength(value: string | null) {
  if (!value) return null;
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isScopedHighlightGroup(group: Element) {
  return group.querySelectorAll("text").length <= 1;
}

function normalizedHighlightLabels(
  highlightLabel?: string,
  highlightAliases: string[] = [],
) {
  const labels = [highlightLabel, ...highlightAliases]
    .map((label) => label?.trim())
    .filter((label): label is string => Boolean(label));
  return Array.from(new Set(labels));
}

function svgTextMatchesHighlight(text: string, labels: string[]) {
  const normalized = text.trim();
  return labels.some(
    (label) =>
      normalized === label ||
      normalized.startsWith(`${label} :`) ||
      normalized.startsWith(`${label}:`) ||
      normalized.startsWith(`${label}：`),
  );
}

export function InlineSvg({
  svg,
  highlightLabel,
  highlightAliases = [],
  highlightKey,
  scale = 1,
  className,
}: {
  svg: string;
  highlightLabel?: string;
  highlightAliases?: string[];
  highlightKey?: string | number;
  scale?: number;
  className?: string;
}) {
  const translation = useTranslation();
  const t = translation.i18n.exists("diagrams.detail.noSvg")
    ? translation.t
    : appI18n.t.bind(appI18n);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>("");
  const sanitizedSvg = useMemo(() => sanitizeSvgMarkup(svg), [svg]);

  useEffect(() => {
    setError("");
  }, [sanitizedSvg]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !sanitizedSvg) return;
    const svgEl = root.querySelector("svg");
    if (!svgEl) {
      setError(t("diagrams.detail.invalidSvg"));
      return;
    }

    if (!svgEl.getAttribute("viewBox")) {
      const width = parseSvgLength(svgEl.getAttribute("width"));
      const height = parseSvgLength(svgEl.getAttribute("height"));
      if (width && height) {
        svgEl.setAttribute("viewBox", `0 0 ${width} ${height}`);
      }
    }

    svgEl
      .querySelectorAll<SVGElement>(".pum-highlight, .pum-dim")
      .forEach((n) => n.classList.remove("pum-highlight", "pum-dim"));

    const targetLabels = normalizedHighlightLabels(highlightLabel, highlightAliases);
    if (targetLabels.length === 0) return;

    const texts = Array.from(svgEl.querySelectorAll<SVGTextElement>("text"));
    const matches = texts.filter((t) =>
      svgTextMatchesHighlight(t.textContent ?? "", targetLabels),
    );
    if (matches.length === 0) return;

    const highlightNodes = new Set<Element>();
    for (const t of matches) {
      highlightNodes.add(t);
      const g = t.closest("g");
      if (g && isScopedHighlightGroup(g)) highlightNodes.add(g);
      const prev = t.previousElementSibling;
      if (
        prev &&
        ["rect", "ellipse", "circle", "polygon", "path"].includes(
          prev.tagName.toLowerCase(),
        )
      ) {
        highlightNodes.add(prev);
      }
    }
    highlightNodes.forEach((n) => n.classList.add("pum-highlight"));

    const first = matches[0];
    if (first && "scrollIntoView" in first) {
      try {
        first.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      } catch {
        /* ignore */
      }
    }
  }, [sanitizedSvg, highlightAliases, highlightLabel, highlightKey, scale, t]);

  if (!sanitizedSvg) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {t("diagrams.detail.noSvg")}
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive" className="border p-4 text-sm">
        {t("diagrams.detail.renderFailed", { error })}
      </Alert>
    );
  }

  return (
    <>
      <style>{`
        .uml-inline-svg {
          --uml-highlight: var(--info);
          --uml-highlight-strong: var(--info);
          --uml-highlight-soft: color-mix(in srgb, var(--info) 22%, transparent);
        }
        /* Saved SVGs carry pixel sizes; keep fitting and zooming stable when markup is reinserted. */
        .uml-inline-svg > svg {
          width: var(--uml-svg-width, 100%) !important;
          max-width: none !important;
          height: auto !important;
          display: block;
          overflow: visible;
        }
        .pum-highlight rect,
        .pum-highlight ellipse,
        .pum-highlight circle,
        .pum-highlight polygon,
        .pum-highlight path,
        rect.pum-highlight,
        ellipse.pum-highlight,
        circle.pum-highlight,
        polygon.pum-highlight,
        path.pum-highlight {
          stroke: var(--uml-highlight) !important;
          stroke-width: 4px !important;
          filter: drop-shadow(0 0 10px color-mix(in srgb, var(--info) 75%, transparent));
        }
        .pum-highlight rect,
        .pum-highlight ellipse,
        .pum-highlight circle,
        .pum-highlight polygon,
        rect.pum-highlight,
        ellipse.pum-highlight,
        circle.pum-highlight,
        polygon.pum-highlight {
          fill: color-mix(in srgb, var(--uml-highlight-soft) 45%, currentColor 0%) !important;
        }
        text.pum-highlight {
          fill: var(--uml-highlight-strong) !important;
          font-weight: 700;
        }
      `}</style>
      <div
        ref={containerRef}
        className={["uml-inline-svg", className].filter(Boolean).join(" ")}
        style={{ "--uml-svg-width": `${Math.round(scale * 10000) / 100}%` } as CSSProperties}
        dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
      />
    </>
  );
}
