// Covers preview isolation, renderer failures, and late results after document switches.
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import "../../../shared/i18n/i18n";
import { DocxPreviewHost } from "./docx-preview-host";

const { renderAsync } = vi.hoisted(() => ({ renderAsync: vi.fn() }));
vi.mock("docx-preview", () => ({ renderAsync }));

describe("DocxPreviewHost", () => {
  beforeEach(() => { renderAsync.mockReset(); });

  it("renders a real DOCX with Chinese text, a table, page breaks, headers, and footers", async () => {
    const actual = await vi.importActual<typeof import("docx-preview")>("docx-preview");
    renderAsync.mockImplementation(actual.renderAsync);
    const zip = new JSZip();
    const wordNs = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const relNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
    zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file("_rels/.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rDoc" Type="${relNs}/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file("word/_rels/document.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rHeader" Type="${relNs}/header" Target="header1.xml"/><Relationship Id="rFooter" Type="${relNs}/footer" Target="footer1.xml"/></Relationships>`);
    zip.file("word/header1.xml", `<w:hdr xmlns:w="${wordNs}">${paragraph("项目页眉")}</w:hdr>`);
    zip.file("word/footer1.xml", `<w:ftr xmlns:w="${wordNs}">${paragraph("说明书页脚")}</w:ftr>`);
    zip.file("word/document.xml", `<w:document xmlns:w="${wordNs}" xmlns:r="${relNs}"><w:body>${paragraph("中文说明书")}<w:tbl><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc>${paragraph("需求条目")}</w:tc></w:tr></w:tbl><w:p><w:r><w:br w:type="page"/></w:r></w:p>${paragraph("第二页正文")}<w:sectPr><w:headerReference w:type="default" r:id="rHeader"/><w:footerReference w:type="default" r:id="rFooter"/><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`);
    const blob = new Blob([await zip.generateAsync({ type: "arraybuffer" })]);
    const onLoadError = vi.fn();
    render(<DocxPreviewHost blob={blob} onLoadError={onLoadError} />);
    const host = screen.getByTestId("docx-preview");
    await waitFor(() => expect(host.shadowRoot?.querySelector("table")?.textContent).toContain("需求条目"));
    expect(host.shadowRoot?.textContent).toContain("中文说明书");
    expect(host.shadowRoot?.textContent).toContain("第二页正文");
    expect(host.shadowRoot?.querySelector("header")?.textContent).toContain("项目页眉");
    expect(host.shadowRoot?.querySelector("footer")?.textContent).toContain("说明书页脚");
    expect(host.shadowRoot?.querySelectorAll("section.docx")).toHaveLength(2);
    expect(onLoadError).not.toHaveBeenCalled();
  });

  it("isolates document styles and renders page content without an external server", async () => {
    renderAsync.mockImplementation(async (_blob, body, styles) => {
      styles.innerHTML = "<style>p{color:red}</style>";
      body.innerHTML = "<section class='docx'><p>说明书正文</p></section>";
    });
    const onLoadError = vi.fn();
    render(<DocxPreviewHost blob={new Blob(["docx"])} onLoadError={onLoadError} />);
    const host = screen.getByTestId("docx-preview");
    await waitFor(() => expect(host.shadowRoot?.textContent).toContain("说明书正文"));
    expect(document.querySelector("section.docx")).toBeNull();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(renderAsync).toHaveBeenCalledWith(expect.any(Blob), expect.any(HTMLElement), expect.any(HTMLElement),
      expect.objectContaining({ renderAltChunks: false, useBase64URL: true, renderHeaders: true, renderFooters: true }));
    expect(onLoadError).not.toHaveBeenCalled();
  });

  it("keeps the next document visible when an earlier render finishes late", async () => {
    let finishFirst!: () => void;
    renderAsync.mockImplementationOnce((_blob, body) => new Promise<void>(resolve => {
      finishFirst = () => { body.textContent = "过期文档"; resolve(); };
    })).mockImplementationOnce(async (_blob, body) => { body.textContent = "当前文档"; });
    const onLoadError = vi.fn();
    const { rerender } = render(<DocxPreviewHost blob={new Blob(["first"])} onLoadError={onLoadError} />);
    await waitFor(() => expect(renderAsync).toHaveBeenCalledTimes(1));
    rerender(<DocxPreviewHost blob={new Blob(["next"])} onLoadError={onLoadError} />);
    const host = screen.getByTestId("docx-preview");
    await waitFor(() => expect(host.shadowRoot?.textContent).toContain("当前文档"));
    await act(async () => finishFirst());
    expect(host.shadowRoot?.textContent).not.toContain("过期文档");
    expect(host.shadowRoot?.textContent).toContain("当前文档");
  });

  it("reports malformed DOCX and suppresses errors after unmount", async () => {
    renderAsync.mockRejectedValueOnce(new Error("invalid zip"));
    const onLoadError = vi.fn();
    const first = render(<DocxPreviewHost blob={new Blob(["invalid"])} onLoadError={onLoadError} />);
    await waitFor(() => expect(onLoadError).toHaveBeenCalledTimes(1));
    first.unmount();
    let rejectRender!: (error: Error) => void;
    renderAsync.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRender = reject; }));
    const second = render(<DocxPreviewHost blob={new Blob(["slow"])} onLoadError={onLoadError} />);
    await waitFor(() => expect(renderAsync).toHaveBeenCalledTimes(2));
    const host = screen.getByTestId("docx-preview");
    second.unmount();
    await act(async () => rejectRender(new Error("late failure")));
    expect(host.shadowRoot?.childNodes.length).toBe(0);
    expect(onLoadError).toHaveBeenCalledTimes(1);
  });
});
