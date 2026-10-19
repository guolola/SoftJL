// Seeds an explicitly configured development provider without duplicating rows or replacing stored secrets.
import type { ProviderConfigStore } from "../provider-configs/provider-config-store.js";
import { normalizeManagedProviderBaseUrl } from "../provider-configs/provider-url-policy.js";

export async function seedDemoProvider(store: ProviderConfigStore, nodeEnv: string | null,
  env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  if (nodeEnv === "production" || env.UML_DEMO_PROVIDER_SEED !== "true") return null;
  const configuredName = env.UML_DEMO_PROVIDER_NAME?.trim();
  const configuredUrl = env.UML_DEMO_PROVIDER_BASE_URL?.trim();
  const name = configuredName || (!configuredUrl ? "Nonelinear" : undefined);
  const baseUrl = configuredUrl || (!configuredName ? "https://api.nonelinear.com.cn/v1" : undefined);
  const model = env.UML_DEMO_PROVIDER_MODEL?.trim() || "deepseek-v4.1-flash";
  const normalizedUrl = baseUrl ? normalizeManagedProviderBaseUrl(baseUrl) : null;
  const matches = (await store.list()).filter(provider => provider.scopeType === "system"
    && ((name && provider.name === name) || (normalizedUrl && provider.baseUrl === normalizedUrl)));
  if (matches.length > 1) return "演示供应商名称重复，请在管理端保留唯一配置后重试。";
  const existing = matches[0];
  if (existing) {
    if (existing.status !== "active") return "指定演示供应商已停用或撤销，请在管理端处理。";
    if (normalizedUrl && existing.baseUrl !== normalizedUrl) return "演示供应商地址与已有配置不同，请在管理端确认地址；启动时不会覆盖。";
    if (existing.defaultModel !== model || !existing.allowedModels.includes(model)) {
      if (!store.updateMetadata) return "当前供应商存储不支持更新默认模型，请在管理端设置。";
      await store.updateMetadata(existing.id, { defaultModel: model, allowedModels: [...new Set([...existing.allowedModels, model])] }, "development-bootstrap");
    }
    return `演示供应商已复用，默认模型：${model}`;
  }
  if (!name || !normalizedUrl) return "自定义演示供应商需要同时配置 UML_DEMO_PROVIDER_NAME 和 UML_DEMO_PROVIDER_BASE_URL。";
  if (!env.UML_DEMO_PROVIDER_API_KEY?.trim()) return "演示供应商需要密钥：请在本地 .env.local 填写 UML_DEMO_PROVIDER_API_KEY 后重启。";
  await store.create({ name, baseUrl: normalizedUrl, apiKey: env.UML_DEMO_PROVIDER_API_KEY.trim(), defaultModel: model,
    allowedModels: [model], createdBy: "development-bootstrap", scopeType: "system", keyPurpose: "本地演示" });
  return `演示供应商已创建，默认模型：${model}`;
}
