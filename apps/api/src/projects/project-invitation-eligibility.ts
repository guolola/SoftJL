// Resolves registered invitees before membership writes or inbox delivery.
import type { ApiError } from "@uml-platform/contracts";
import type { AuthStore, UserRecord } from "../auth/in-memory-auth-store.js";

export async function searchProjectInvitees(authStore: AuthStore, projectId: string, inviterId: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];
  const [users, members] = await Promise.all([authStore.listUsers(), authStore.listProjectMembers(projectId)]);
  const existingUsernames = new Set(members.map((member) => member.username.toLowerCase()));
  // Suggestions contain public identity only and exclude users who cannot receive a new invitation.
  return users
    .filter((user) =>
      user.status === "active" &&
      user.id !== inviterId &&
      !existingUsernames.has(user.username.toLowerCase()) &&
      (user.username.toLowerCase().includes(normalizedQuery) || user.displayName.toLowerCase().includes(normalizedQuery)),
    )
    .sort((a, b) => a.username.localeCompare(b.username))
    .slice(0, 20)
    .map(({ id, username, displayName, avatarUrl }) => ({ id, username, displayName, avatarUrl }));
}

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
