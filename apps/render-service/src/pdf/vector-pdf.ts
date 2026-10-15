// Converts PlantUML SVG into a single vector PDF page with embedded CJK fonts.
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export function pdfFontPaths() {
  // Both source execution and compiled execution resolve the same packaged assets.
  const directory = new URL(import.meta.url.endsWith(".ts") ? "../../dist/assets/pdf-fonts/" : "../assets/pdf-fonts/", import.meta.url);
  return {
    regular: process.env.UML_PDF_FONT_REGULAR || fileURLToPath(new URL("NotoSansCJKsc-Regular.otf", directory)),
    bold: process.env.UML_PDF_FONT_BOLD || fileURLToPath(new URL("NotoSansCJKsc-Bold.otf", directory)),
  };
}

export async function pdfFontsReady() {
  try { await Promise.all(Object.values(pdfFontPaths()).map((path) => access(path))); return true; }
  catch { return false; }
}

function svgDimensions(svg: string) {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!root) throw new Error("PDF conversion requires valid SVG");
  const viewBox = root.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1].trim().split(/[\s,]+/).map(Number);
  const length = (name: string) => {
    const value = root.match(new RegExp(`\\b${name}\\s*=\\s*["']([0-9.]+)(px|pt)?["']`, "i"));
    return value ? Number(value[1]) * (value[2] === "pt" ? 4 / 3 : 1) : NaN;
  };
  const width = viewBox?.length === 4 ? viewBox[2] : length("width");
  const height = viewBox?.length === 4 ? viewBox[3] : length("height");
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) throw new Error("SVG has no valid page dimensions");
  return { width, height };
}

export async function svgToVectorPdf(svg: string): Promise<Buffer> {
  if (!await pdfFontsReady()) throw new Error("PDF fonts are unavailable; prepare PDF fonts or configure UML_PDF_FONT_REGULAR and UML_PDF_FONT_BOLD");
  const fonts = pdfFontPaths();
  const { width, height } = svgDimensions(svg);
  const margin = 24;
  // SVG uses pixels; convert to PDF points and fit unusually large diagrams within PDF page limits.
  const scale = Math.min(0.75, (14_400 - margin * 2) / Math.max(width, height));
  const doc = new PDFDocument({ size: [width * scale + margin * 2, height * scale + margin * 2], margin: 0 });
  doc.registerFont("UmlRegular", fonts.regular);
  doc.registerFont("UmlBold", fonts.bold);
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  try {
    SVGtoPDF(doc, svg, margin, margin, {
      width: width * scale, height: height * scale,
      fontCallback: (_family, bold, italic, fontOptions) => {
        fontOptions.fauxItalic = italic;
        return bold ? "UmlBold" : "UmlRegular";
      },
      // Render only self-contained PlantUML graphics; do not fetch linked images or documents.
      imageCallback: () => { throw new Error("External SVG images are unsupported in PDF export"); },
      documentCallback: () => { throw new Error("External SVG documents are unsupported in PDF export"); },
    });
    doc.end();
    return await completed;
  } catch (error) {
    doc.destroy();
    throw error;
  }
}
