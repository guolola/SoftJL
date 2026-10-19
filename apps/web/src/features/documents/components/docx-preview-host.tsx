// Renders DOCX in an isolated shadow tree and discards obsolete asynchronous renders.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

export function DocxPreviewHost({ blob, onLoadError }: {
  blob: Blob;
  onLoadError: () => void;
}) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onLoadError);
  onErrorRef.current = onLoadError;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    root.replaceChildren();
    let active = true;
    setLoading(true);
    // Render off-screen first: a slow previous document must never overwrite the current preview.
    const body = document.createElement("div");
    const styles = document.createElement("div");
    void import("docx-preview").then(async ({ renderAsync }) => {
      if (!active) return;
      await renderAsync(blob, body, styles, {
        inWrapper: true,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        // Embedded HTML is unnecessary for generated documents; base64 assets need no object URL lifecycle.
        renderAltChunks: false,
        useBase64URL: true,
      });
      if (!active) return;
      const base = document.createElement("style");
      base.textContent = ":host{display:block;color:#000;color-scheme:light;font:16px serif;text-align:left} .docx-wrapper{padding:24px;min-width:fit-content;background:#e5e7eb} .docx-wrapper>section.docx{flex-shrink:0}";
      root.replaceChildren(styles, base, body);
      setLoading(false);
    }).catch(() => {
      if (active) onErrorRef.current();
    });
    return () => {
      active = false;
      root.replaceChildren();
    };
  }, [blob]);

  return <div className="relative h-full overflow-auto" aria-busy={loading}>
    {loading && <div role="status" className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />{t("documentsPage.previewLoading")}
    </div>}
    <div ref={hostRef} data-testid="docx-preview" role="document" aria-label={t("documentsPage.previewLabel")} />
  </div>;
}
