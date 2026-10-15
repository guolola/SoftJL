// Normalizes and classifies managed OpenAI-compatible provider endpoints.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class ProviderConfigPolicyError extends Error {}

export type ProviderHostnameResolver = (hostname: string) => Promise<string[]>;

function assertPublicIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part));
  const [first = -1, second = -1, third = -1] = parts;
  if (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  ) {
    throw new ProviderConfigPolicyError("Provider Base URL must use a public HTTPS host");
  }
}

export function assertPublicHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[(.*)\]$/u, "$1");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0"
  ) {
    throw new ProviderConfigPolicyError("Provider Base URL must use a public HTTPS host");
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    assertPublicIpv4(normalized);
  }

  if (ipVersion === 6) {
    const mappedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(normalized)?.[1];
    if (mappedIpv4 && isIP(mappedIpv4) === 4) {
      assertPublicIpv4(mappedIpv4);
    }
    const firstHextet = Number.parseInt(normalized.split(":", 1)[0] || "0", 16);
    if (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) ||
      normalized.startsWith("ff")
    ) {
      throw new ProviderConfigPolicyError("Provider Base URL must use a public HTTPS host");
    }
  }
}

export function normalizeManagedProviderBaseUrl(baseUrl: string) {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new ProviderConfigPolicyError("Provider Base URL must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderConfigPolicyError("Provider Base URL must use HTTPS");
  }
  if (url.username || url.password) {
    throw new ProviderConfigPolicyError("Provider Base URL must not contain credentials");
  }
  assertPublicHostname(url.hostname);
  if (url.port && url.port !== "443") {
    throw new ProviderConfigPolicyError("Provider Base URL must use the default HTTPS port");
  }
  return url.origin;
}

export async function resolveProviderHostname(hostname: string) {
  const addresses = await lookup(hostname, { all: true });
  return addresses.map((address) => address.address);
}

export async function assertManagedProviderBaseUrlResolvesPublicly(
  baseUrl: string,
  resolver: ProviderHostnameResolver = resolveProviderHostname,
) {
  const normalizedBaseUrl = normalizeManagedProviderBaseUrl(baseUrl);
  const hostname = new URL(normalizedBaseUrl).hostname;
  const normalizedHostname = hostname.toLowerCase().replace(/^\[(.*)\]$/u, "$1");
  if (isIP(normalizedHostname)) return normalizedBaseUrl;

  let addresses: string[];
  try {
    addresses = await resolver(normalizedHostname);
  } catch {
    throw new ProviderConfigPolicyError(
      "Provider Base URL hostname must resolve to public IP addresses",
    );
  }
  if (addresses.length === 0) {
    throw new ProviderConfigPolicyError(
      "Provider Base URL hostname must resolve to public IP addresses",
    );
  }
  for (const address of addresses) {
    assertPublicHostname(address);
  }
  return normalizedBaseUrl;
}

export function inferOpenAiCompatibleProvider(baseUrl: string, provider?: string) {
  const explicitProvider = provider?.trim();
  if (explicitProvider) return explicitProvider;

  const hostname = new URL(normalizeManagedProviderBaseUrl(baseUrl)).hostname.toLowerCase();
  if (hostname === "api.siliconflow.cn") return "siliconflow";
  if (
    hostname === "api.nonelinear.com" ||
    hostname === "api.nonelinear.com.cn"
  ) {
    return "nonelinear";
  }
  if (hostname === "api.openai.com") return "openai";
  return "openai-compatible";
}
