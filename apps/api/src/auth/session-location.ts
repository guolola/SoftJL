// Resolves stored session IP addresses into user-facing location labels.
import { createRequire } from "node:module";
import { isIP } from "node:net";

type IP2RegionResult = {
  country: string;
  province: string;
  city: string;
  isp: string;
};
type IP2RegionSearch = {
  search(ipAddress: string): IP2RegionResult | null;
};
type IP2RegionConstructor = new () => IP2RegionSearch;

const require = createRequire(import.meta.url);
const ip2regionModule = require("ip2region") as {
  default?: IP2RegionConstructor;
};
const IP2Region = ip2regionModule.default ?? (ip2regionModule as unknown as IP2RegionConstructor);

let ip2region: IP2RegionSearch | null = null;

function normalizeIpAddress(ipAddress: string | null | undefined) {
  const raw = ipAddress?.trim();
  if (!raw) return null;
  return raw.startsWith("::ffff:") ? raw.slice("::ffff:".length) : raw;
}

function isLoopbackIp(ipAddress: string) {
  return (
    ipAddress === "::1" ||
    ipAddress === "0:0:0:0:0:0:0:1" ||
    ipAddress.startsWith("127.")
  );
}

function isPrivateIpv4(ipAddress: string) {
  const parts = ipAddress.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [first, second] = parts;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function isPrivateIpv6(ipAddress: string) {
  const normalized = ipAddress.toLowerCase();
  return normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

function getIp2Region() {
  ip2region ??= new IP2Region();
  return ip2region;
}

function compactLocationParts(parts: string[]) {
  const seen = new Set<string>();
  return parts
    .map((part) => part.trim())
    .filter((part) => part && part !== "0")
    .filter((part) => {
      if (seen.has(part)) return false;
      seen.add(part);
      return true;
    });
}

export function resolveSessionLocation(ipAddress: string | null | undefined) {
  const normalizedIp = normalizeIpAddress(ipAddress);
  if (!normalizedIp || isIP(normalizedIp) === 0) {
    return { locationLabel: null, region: null };
  }

  if (isLoopbackIp(normalizedIp)) {
    return { locationLabel: "本机", region: "本机" };
  }
  if (isPrivateIpv4(normalizedIp) || isPrivateIpv6(normalizedIp)) {
    return { locationLabel: "内网地址", region: "内网地址" };
  }

  try {
    const result = getIp2Region().search(normalizedIp);
    if (!result) return { locationLabel: null, region: null };
    const locationParts = compactLocationParts([
      result.country,
      result.province,
      result.city,
    ]);
    const regionParts = compactLocationParts([result.province, result.city]);
    return {
      locationLabel: locationParts.length > 0 ? locationParts.join(" ") : null,
      region: regionParts.length > 0 ? regionParts.join(" ") : null,
    };
  } catch {
    return { locationLabel: null, region: null };
  }
}
