import { useOnlineStatus } from '../hooks/useOnlineStatus';

/**
 * Sichtbarer Hinweis, wenn kein Netz da ist. Die App bleibt mit Seed-Daten
 * nutzbar (Leitprinzip: graceful degrade).
 */
export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className="bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-800"
    >
      Offline — es werden gespeicherte Rezepte &amp; Schätzpreise angezeigt.
    </div>
  );
}
