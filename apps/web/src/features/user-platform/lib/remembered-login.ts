// Persists only the login identifier and removes passwords saved by older clients.
const REMEMBERED_LOGIN_IDENTIFIER_KEY = "uml-auth-remembered-username";
const LEGACY_REMEMBERED_LOGIN_PASSWORD_KEY = "uml-auth-remembered-password";

export function clearLegacyRememberedLoginPassword() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_REMEMBERED_LOGIN_PASSWORD_KEY);
  } catch {
    // Storage may be blocked; optional preferences must not prevent authentication.
  }
}

export function readRememberedLoginIdentifier() {
  if (typeof window === "undefined") return "";
  try {
    const value = window.localStorage.getItem(REMEMBERED_LOGIN_IDENTIFIER_KEY)?.trim().toLowerCase() ?? "";
    if (!/^[a-z0-9_]{3,32}$/u.test(value)) { window.localStorage.removeItem(REMEMBERED_LOGIN_IDENTIFIER_KEY); return ""; }
    return value;
  } catch {
    return "";
  }
}

export function writeRememberedLoginIdentifier(identifier: string, remember: boolean) {
  clearLegacyRememberedLoginPassword();
  if (typeof window === "undefined") return;
  try {
    if (remember) {
      window.localStorage.setItem(REMEMBERED_LOGIN_IDENTIFIER_KEY, identifier.trim());
    } else {
      window.localStorage.removeItem(REMEMBERED_LOGIN_IDENTIFIER_KEY);
    }
  } catch {
    // Login remains successful even when the browser cannot save the identifier.
  }
}
