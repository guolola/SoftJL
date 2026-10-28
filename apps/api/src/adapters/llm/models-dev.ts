// Downloads the complete public Models.dev catalog without sending credentials or project data.
const catalogUrl = "https://models.dev/api.json?type=all";
const maximumBytes = 30_000_000;

export async function fetchModelsDev(): Promise<unknown> {
  const response = await fetch(catalogUrl, { signal: AbortSignal.timeout(20000), redirect: "error" });
  if (!response.ok || !response.body) throw new Error("Models.dev 模型资料同步失败");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumBytes) throw new Error("模型资料超出大小限制");
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel(); }
  // Parsing and full catalog validation must finish before a snapshot can replace the durable cache.
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
