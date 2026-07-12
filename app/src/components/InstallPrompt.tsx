import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Nicht-aufdringlicher Installations-Hinweis (PWA "Add to Home Screen").
 * Erscheint nur, wenn der Browser das Event feuert und noch nicht installiert.
 */
const DISMISS_KEY = 'mealio.installDismissed';

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* localStorage evtl. nicht verfügbar */
    }
    setDismissed(true);
  };

  if (!deferred || dismissed) return null;

  const install = async () => {
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
  };

  return (
    <div className="mx-4 mb-2 flex items-center gap-3 rounded-card bg-brand-50 px-4 py-2 text-sm ring-1 ring-brand-100">
      <span className="flex-1 text-brand-800">Mealio als App installieren?</span>
      <button
        type="button"
        onClick={() => void install()}
        className="rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white active:scale-95"
      >
        Installieren
      </button>
      <button
        type="button"
        aria-label="Hinweis schließen"
        onClick={dismiss}
        className="text-brand-400"
      >
        ✕
      </button>
    </div>
  );
}
