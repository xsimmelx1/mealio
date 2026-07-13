import { Navigate, Outlet } from 'react-router-dom';
import { usePrefsStore } from '../state/prefsStore';
import BottomNav from './BottomNav';
import InstallPrompt from './InstallPrompt';
import OfflineBanner from './OfflineBanner';
import SideNav from './SideNav';

/**
 * Responsive Shell:
 * - Mobil: zentrierte Spalte (max ~480px) + fixierte Bottom-Nav.
 * - Desktop (ab lg): Seitennavigation links + breiterer, zentrierter Content.
 * Alle Tab-Screens rendern im <Outlet/>. Ohne abgeschlossenes Onboarding -> Weiterleitung.
 */
export default function AppLayout() {
  const onboardingComplete = usePrefsStore((s) => s.prefs.onboardingComplete);

  if (!onboardingComplete) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="mx-auto flex min-h-full max-w-app flex-col bg-cream lg:max-w-none lg:flex-row">
      <SideNav />
      <div className="flex min-h-full min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-24 pt-4 lg:max-w-5xl lg:px-8 lg:pb-10">
          <Outlet />
        </main>
        <InstallPrompt />
      </div>
      <BottomNav />
    </div>
  );
}
