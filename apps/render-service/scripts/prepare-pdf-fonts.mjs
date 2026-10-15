// Caches licensed, pinned CJK fonts and copies them into the render-service runtime.
import { mkdir, readFile, writeFile, copyFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const cache = fileURLToPath(new URL("../.runtime/pdf-fonts/", import.meta.url));
const destination = fileURLToPath(new URL("../dist/assets/pdf-fonts/", import.meta.url));
const base = "https://raw.githubusercontent.com/notofonts/noto-cjk/Sans2.004/Sans/";
const files = [
  ["NotoSansCJKsc-Regular.otf", "OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf", process.env.UML_PDF_FONT_REGULAR],
  ["NotoSansCJKsc-Bold.otf", "OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf", process.env.UML_PDF_FONT_BOLD],
  ["LICENSE.txt", "../LICENSE"],
];
await mkdir(cache, { recursive: true });
await mkdir(destination, { recursive: true });
for (const [name, remote, override] of files) {
  const target = join(cache, name);
  if (override) {
    await copyFile(override, target);
  } else {
    let cached = true;
    try { await access(target); } catch { cached = false; }
    if (!cached) {
      const response = await fetch(new URL(remote, base), { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`PDF font preparation failed (${response.status}): ${name}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (name.endsWith(".otf") && buffer.subarray(0, 4).toString() !== "OTTO") throw new Error(`Invalid OpenType font: ${name}`);
      await writeFile(target, buffer);
    }
  }
  const buffer = await readFile(target);
  if (!buffer.length) throw new Error(`Empty PDF font asset: ${name}`);
  await copyFile(target, join(destination, name));
}
console.log("PDF fonts ready (Noto Sans CJK Sans2.004)");
