// Owns the imperative OnlyOffice editor lifecycle inside a stable React container.
import { useEffect, useRef } from "react";

type OnlyOfficeConfig = Record<string, unknown>;

interface OnlyOfficeEditorInstance {
  destroyEditor?: () => void;
}

interface DocsApiGlobal {
  DocEditor: new (
    elementId: string,
    config: OnlyOfficeConfig,
  ) => OnlyOfficeEditorInstance;
}

declare global {
  interface Window {
    DocsAPI?: DocsApiGlobal;
  }
}

const scriptLoaders = new Map<string, Promise<void>>();

function normalizeDocumentServerUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function onlyOfficeApiScriptUrl(documentServerUrl: string) {
  return `${normalizeDocumentServerUrl(
    documentServerUrl,
  )}/web-apps/apps/api/documents/api.js`;
}

function loadOnlyOfficeApi(documentServerUrl: string) {
  const scriptUrl = onlyOfficeApiScriptUrl(documentServerUrl);
  const cached = scriptLoaders.get(scriptUrl);
  if (cached) return cached;

  const loader = new Promise<void>((resolve, reject) => {
    if (window.DocsAPI?.DocEditor) {
      resolve();
      return;
    }

    const existingScript = Array.from(document.scripts).find(
      (script) => script.dataset.onlyofficeApi === scriptUrl,
    );

    if (existingScript?.dataset.loaded === "true") {
      resolve();
      return;
    }

    const script = existingScript ?? document.createElement("script");
    script.dataset.onlyofficeApi = scriptUrl;
    script.async = true;
    script.src = scriptUrl;

    const cleanup = () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
    const handleLoad = () => {
      cleanup();
      script.dataset.loaded = "true";
      resolve();
    };
    const handleError = () => {
      cleanup();
      scriptLoaders.delete(scriptUrl);
      reject(new Error(`无法加载 OnlyOffice API 脚本：${scriptUrl}`));
    };

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);

    if (!existingScript) {
      document.head.appendChild(script);
    }
  });

  scriptLoaders.set(scriptUrl, loader);
  return loader;
}

export function OnlyOfficeEditorHost({
  documentServerUrl,
  config,
  width = "100%",
  height = "100%",
  onLoadError,
}: {
  documentServerUrl: string;
  config: OnlyOfficeConfig;
  width?: string;
  height?: string;
  onLoadError?: (description: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const elementIdRef = useRef<string | null>(null);
  const onLoadErrorRef = useRef(onLoadError);

  if (!elementIdRef.current) {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    elementIdRef.current = `onlyoffice-editor-${id}`;
  }

  useEffect(() => {
    onLoadErrorRef.current = onLoadError;
  }, [onLoadError]);

  useEffect(() => {
    let cancelled = false;
    let editor: OnlyOfficeEditorInstance | null = null;
    const host = hostRef.current;
    const elementId = elementIdRef.current;

    if (!host || !elementId) return undefined;

    host.replaceChildren();
    const editorTarget = document.createElement("div");
    editorTarget.id = elementId;
    editorTarget.style.width = "100%";
    editorTarget.style.height = "100%";
    host.appendChild(editorTarget);

    void loadOnlyOfficeApi(documentServerUrl)
      .then(() => {
        if (cancelled) return;
        if (!window.DocsAPI?.DocEditor) {
          throw new Error("OnlyOffice DocsAPI 未加载完成");
        }
        editor = new window.DocsAPI.DocEditor(elementId, config);
      })
      .catch((error) => {
        if (cancelled) return;
        onLoadErrorRef.current?.(
          error instanceof Error ? error.message : "OnlyOffice 编辑器加载失败",
        );
      });

    return () => {
      cancelled = true;
      try {
        editor?.destroyEditor?.();
      } catch {
        // The editor can already be partially removed during theme reloads.
      }
      if (editorTarget.parentNode) {
        editorTarget.parentNode.removeChild(editorTarget);
      }
      host.replaceChildren();
    };
  }, [config, documentServerUrl]);

  return (
    <div
      ref={hostRef}
      data-testid="onlyoffice-editor"
      style={{ width, height }}
    />
  );
}
