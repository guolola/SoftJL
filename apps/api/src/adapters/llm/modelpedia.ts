// Downloads the complete public Modelpedia catalog without sending credentials or project data.
const origin = "https://api.modelpedia.dev/v1";
const pageSize = 500;
const maximumModels = 30000;

export async function fetchModelpedia(): Promise<unknown> {
  const signal = AbortSignal.timeout(20000);
  let bytes = 0;
  const read = async (path: string): Promise<Record<string, unknown>> => {
    const response = await fetch(`${origin}/${path}`, { signal, redirect: "error" });
    if (!response.ok || !response.body) throw new Error("Modelpedia 模型资料同步失败");
    const reader = response.body.getReader(); const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 30_000_000) throw new Error("模型资料超出大小限制");
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel(); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  };
  const providers = await read("providers");
  if (!Array.isArray(providers.data) || !providers.data.length) throw new Error("Modelpedia 供应商资料无效");
  const models: unknown[] = [];
  let total: number | undefined;
  // Publish only a complete snapshot; truncated pages must never replace a healthy cache.
  do {
    const page = await read(`models?limit=${pageSize}&offset=${models.length}`);
    const meta = page.meta as { total?: number; offset?: number } | undefined;
    if (!Array.isArray(page.data) || !page.data.length || !Number.isInteger(meta?.total)
      || meta!.total! > maximumModels || meta!.offset !== models.length
      || (total !== undefined && total !== meta!.total)) throw new Error("Modelpedia 模型分页资料无效");
    total = meta!.total;
    models.push(...page.data);
    if (models.length > total!) throw new Error("Modelpedia 模型数量不匹配");
  } while (models.length < total!);
  return { providers: providers.data, models };
}
