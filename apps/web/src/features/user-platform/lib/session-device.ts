// Formats stored session user-agent strings for account session displays.
import Bowser from "bowser";

export function formatSessionDevice(userAgent: string | null | undefined, unknown = "未知设备") {
  const rawUserAgent = userAgent?.trim();
  if (!rawUserAgent) return unknown;

  const parser = Bowser.getParser(rawUserAgent);
  const browserName = parser.getBrowserName().replace(/^Microsoft Edge$/u, "Edge");
  const osName = parser.getOSName();

  if (osName && browserName) return `${osName} • ${browserName}`;
  if (browserName) return browserName;
  if (osName) return osName;
  return unknown;
}

export function formatSessionRegion(input: {
  locationLabel?: string | null;
  region?: string | null;
}, unknown = "未知地区") {
  return input.locationLabel?.trim() || input.region?.trim() || unknown;
}
