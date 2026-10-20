// Seeds optional local development users without leaking that startup behavior into route registration.
import { hashPassword } from "../security/password-hashing.js";
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import type { AdminRole } from "@uml-platform/contracts";
export async function seedGuestUser(authStore: AuthStore) {
    if (process.env.UML_ENABLE_GUEST_ACCESS !== "true")
        return null;
    const username = (process.env.UML_GUEST_USERNAME?.trim() || "guest").toLowerCase();
    const password = process.env.UML_GUEST_PASSWORD?.trim() || "guest";
    const displayName = process.env.UML_GUEST_DISPLAY_NAME?.trim() || "Guest";
    const patch = {
        displayName,
        passwordHash: hashPassword(password),
        systemRoles: [] as AdminRole[],
        mfaEnabled: false,
        mfaSecret: null,
        mfaPendingSecret: null,
        mfaPendingExpiresAt: null,
    };
    const existing = await authStore.findUserByUsername(username);
    if (existing) {
        await authStore.updateUser(existing.id, patch);
        return existing.id;
    }
    const created = await authStore.createUser({
        username,
        displayName,
        passwordHash: patch.passwordHash,
        systemRoles: [],
    });
    if (created) {
        await authStore.updateUser(created.id, {
            mfaEnabled: false,
            mfaSecret: null,
            mfaPendingSecret: null,
            mfaPendingExpiresAt: null,
        });
    }
    return created?.id ?? null;
}
