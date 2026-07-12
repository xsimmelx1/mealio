import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot() {
  // navigator.onLine ist in Capacitor/PWA verfügbar; defensiv geprüft.
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/** Reaktiver Online/Offline-Status ohne harte window-Annahmen (Capacitor-freundlich). */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
