import { Navigate, Outlet } from 'react-router-dom';
import { usePrefsStore } from '../state/prefsStore';
import BottomNav from './BottomNav';
import OfflineBanner from './OfflineBanner';

/**
 * Mobile-first Shell: zentrierte Spalte (max ~480px), Content scrollt,
 * Bottom-Nav bleibt fixiert. Alle Tab-Screens rendern im <Outlet/>.
 * Solange das Onboarding nicht abgeschlossen ist, wird dorthin umgeleitet.
 */
export default function AppLayout() {
  const onboardingComplete = usePrefsStore((s) => s.prefs.onboardingComplete);

  if (!onboardingComplete) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="mx-auto flex min-h-full max-w-app flex-col bg-cream">
      <OfflineBanner />
      <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
