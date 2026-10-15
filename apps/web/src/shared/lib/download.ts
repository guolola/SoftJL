export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/plain",
) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  downloadBlobFile(filename, blob);
}

export function downloadBlobFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
