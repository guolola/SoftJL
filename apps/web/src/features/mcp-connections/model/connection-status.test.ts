// Covers credential lifetime precedence and successful-call evidence for connection status.
import { describe, expect, it } from "vitest";
import { connectionStatus, overviewStatus } from "./connection-status";
import type { Connection } from "../services/mcp-api";
const connection: Connection = { id: "one", name: "One", kind: "pat", projectIds: [], createdAt: "2026-01-01", expiresAt: "2027-01-01", revokedAt: null, lastUsedAt: null };
const now = Date.parse("2026-10-08");
describe("connection evidence", () => {
  it("requires a successful call and gives revocation and expiry priority", () => {
    expect(connectionStatus(connection, now)).toBe("pending");
    expect(connectionStatus({ ...connection, lastUsedAt: "2026-10-08" }, now)).toBe("connected");
    expect(connectionStatus({ ...connection, expiresAt: "2026-10-01", lastUsedAt: "2026-09-30" }, now)).toBe("expired");
    expect(connectionStatus({ ...connection, revokedAt: "2026-09-01", expiresAt: "2026-10-01", lastUsedAt: "2026-08-30" }, now)).toBe("revoked");
    expect(connectionStatus({ ...connection, lastUsedAt: "invalid" }, now)).toBe("pending");
  });
  it("covers disabled, empty and mixed connection overviews", () => {
    expect(overviewStatus(false, [connection], now)).toBe("disabled");
    expect(overviewStatus(true, [], now)).toBe("disconnected");
    expect(overviewStatus(true, [connection, { ...connection, lastUsedAt: "2026-10-07" }], now)).toBe("connected");
    expect(overviewStatus(true, [{ ...connection, revokedAt: "2026-01-01" }], now)).toBe("revoked");
  });
});
