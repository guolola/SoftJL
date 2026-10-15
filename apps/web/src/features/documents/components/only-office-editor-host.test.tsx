// Verifies the imperative OnlyOffice host owns editor cleanup across reloads.
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnlyOfficeEditorHost } from "./only-office-editor-host";

describe("OnlyOfficeEditorHost", () => {
  afterEach(() => {
    delete window.DocsAPI;
    vi.clearAllMocks();
  });

  it("destroys the previous editor instance before creating the next one", async () => {
    const firstDestroy = vi.fn();
    const secondDestroy = vi.fn();
    const docEditor = vi
      .fn()
      .mockReturnValueOnce({ destroyEditor: firstDestroy })
      .mockReturnValueOnce({ destroyEditor: secondDestroy });
    window.DocsAPI = { DocEditor: docEditor };

    const lightConfig = {
      documentType: "word",
      editorConfig: { customization: { uiTheme: "theme-classic-light" } },
    };
    const darkConfig = {
      documentType: "word",
      editorConfig: { customization: { uiTheme: "theme-dark" } },
    };

    const { rerender, unmount } = render(
      <OnlyOfficeEditorHost
        documentServerUrl="http://127.0.0.1:8080"
        config={lightConfig}
      />,
    );

    await waitFor(() => {
      expect(docEditor).toHaveBeenCalledTimes(1);
    });

    rerender(
      <OnlyOfficeEditorHost
        documentServerUrl="http://127.0.0.1:8080"
        config={darkConfig}
      />,
    );

    await waitFor(() => {
      expect(firstDestroy).toHaveBeenCalledTimes(1);
      expect(docEditor).toHaveBeenCalledTimes(2);
    });

    unmount();

    expect(secondDestroy).toHaveBeenCalledTimes(1);
  });

  it("does not rely on React-owned nodes for the OnlyOffice target", async () => {
    const destroyEditor = vi.fn(() => {
      const target = document.querySelector("[id^='onlyoffice-editor-']");
      target?.remove();
    });
    const docEditor = vi.fn().mockReturnValue({ destroyEditor });
    window.DocsAPI = { DocEditor: docEditor };

    const { unmount } = render(
      <OnlyOfficeEditorHost
        documentServerUrl="http://127.0.0.1:8080"
        config={{ documentType: "word" }}
      />,
    );

    await waitFor(() => {
      expect(docEditor).toHaveBeenCalledTimes(1);
    });

    expect(() => unmount()).not.toThrow();
    expect(destroyEditor).toHaveBeenCalledTimes(1);
  });

  it("does not recreate the editor when only the load-error callback changes", async () => {
    const destroyEditor = vi.fn();
    const docEditor = vi.fn().mockReturnValue({ destroyEditor });
    window.DocsAPI = { DocEditor: docEditor };
    const config = { documentType: "word" };

    const { rerender, unmount } = render(
      <OnlyOfficeEditorHost
        documentServerUrl="http://127.0.0.1:8080"
        config={config}
        onLoadError={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(docEditor).toHaveBeenCalledTimes(1);
    });

    rerender(
      <OnlyOfficeEditorHost
        documentServerUrl="http://127.0.0.1:8080"
        config={config}
        onLoadError={vi.fn()}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(docEditor).toHaveBeenCalledTimes(1);
    expect(destroyEditor).not.toHaveBeenCalled();

    unmount();

    expect(destroyEditor).toHaveBeenCalledTimes(1);
  });
});
