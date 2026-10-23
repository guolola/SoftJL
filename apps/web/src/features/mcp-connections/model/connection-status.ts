// Derives credential status from server evidence, never from configuration or token creation alone.
import type { Connection } from "../services/mcp-api";
export type ConnectionStatus = "disconnected" | "pending" | "connected" | "expired" | "revoked" | "disabled";
export function connectionStatus(connection: Connection, now = Date.now()): ConnectionStatus {
  if (connection.revokedAt) return "revoked";
  if (!Number.isFinite(Date.parse(connection.expiresAt)) || Date.parse(connection.expiresAt) <= now) return "expired";
  return connection.lastUsedAt && Number.isFinite(Date.parse(connection.lastUsedAt)) ? "connected" : "pending";
}
