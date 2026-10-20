// Resolves registered invitees before membership writes or inbox delivery.
import type { ApiError } from "@uml-platform/contracts";
import type { AuthStore, UserRecord } from "../auth/in-memory-auth-store.js";

export async function resolveRegisteredProjectInvitee(
  authStore: AuthStore,
  inviter: Pick<UserRecord, "id" | "username">,
  username: string,
): Promise<{ user: UserRecord } | { error: ApiError }> {
  const normalizedUsername = username.trim().toLowerCase();
  if (normalizedUsername === inviter.username.trim().toLowerCase()) {
    return { error: { code: "PROJECT_INVITATION_SELF", category: "validation", retryable: false } };
  }
  const user = await authStore.findUserByUsername(normalizedUsername);
  if (!user) {
    return { error: { code: "PROJECT_INVITATION_USER_NOT_REGISTERED", category: "validation", retryable: false } };
  }
  if (user.id === inviter.id) {
    return { error: { code: "PROJECT_INVITATION_SELF", category: "validation", retryable: false } };
  }
  return { user };
}
