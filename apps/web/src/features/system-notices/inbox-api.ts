// Calls the authenticated personal inbox API and its recipient-only actions.
import type { InboxMessage, InboxResponse } from "@uml-platform/contracts";
import { requestJson } from "../../services/api-client";

export const inboxApi = {
  list() { return requestJson<InboxResponse>("/api/inbox"); },
  act(message: InboxMessage, action: "read" | "dismiss" | "accept" | "decline") {
    const respond = action === "accept" || action === "decline";
    return requestJson<InboxResponse>(`/api/inbox/${message.kind}/${encodeURIComponent(message.invitationId)}/${respond ? "respond" : action}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      ...(respond ? { body: JSON.stringify({ decision: action }) } : {}),
    });
  },
};
