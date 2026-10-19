// Keeps sidebar promotions dismissed across navigation and reloads until the login session changes.
import { useSyncExternalStore } from 'react';
import { useAuthenticatedRouteSession } from '../../user-platform/components/authenticated-route-session';

type SidebarCard = 'coding-agent' | 'promotional-video';
const storagePrefix = 'uml-sidebar-card-dismissed:';
const listeners = new Set<() => void>();
const fallbackSessions = new Map<string, string>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null) fallbackSessions.clear();
    else fallbackSessions.delete(event.key);
    if (event.key === null || event.key.startsWith(storagePrefix)) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function readDismissedSession(key: string) {
  if (fallbackSessions.has(key)) return fallbackSessions.get(key);
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Storage restrictions must not prevent closing a card during this page's lifetime.
    return fallbackSessions.get(key);
  }
}

export function useSidebarCardDismissal(card: SidebarCard) {
  const session = useAuthenticatedRouteSession();
  const sessionId = session?.session?.id ?? 'anonymous';
  const storageKey = `${storagePrefix}${card}`;
  const dismissed = useSyncExternalStore(
    subscribe,
    () => readDismissedSession(storageKey) === sessionId,
    () => false,
  );

  function dismiss() {
    try {
      // A fresh login creates a new session ID, so prior dismissals no longer match.
      window.localStorage.setItem(storageKey, sessionId);
      fallbackSessions.delete(storageKey);
    } catch {
      fallbackSessions.set(storageKey, sessionId);
    }
    listeners.forEach(listener => listener());
  }

  return { dismissed, dismiss };
}
