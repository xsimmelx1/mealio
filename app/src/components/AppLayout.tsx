import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { usePrefsStore } from '../state/prefsStore';
import BottomNav from './BottomNav';
import InstallPrompt from './InstallPrompt';
import OfflineBanner from './OfflineBanner';
import ShoppingListView from '../routes/ShoppingListView';
import SideNav from './SideNav';

/**
 * Responsive Shell:
 * - Mobil: zentrierte Spalte (max ~480px) + fixierte Bottom-Nav.
 * - Desktop (ab lg): Seitennavigation links + Content + rechts die dauerhaft sichtbare
 *   Einkaufsliste (außer auf /list selbst, wo sie bereits die Hauptansicht ist).
 * Alle Tab-Screens rendern im <Outlet/>. Ohne abgeschlossenes Onboarding -> Weiterleitung.
 */
export default function AppLayout() {
  const onboardingComplete = usePrefsStore((s) => s.prefs.onboardingComplete);
  const { pathname } = useLocation();

  if (!onboardingComplete) {
    return <Navigate to="/onboarding" replace />;
  }

  // Auf /list ist die Liste schon die Hauptansicht -> kein doppeltes Panel rechts.
  const showShoppingAside = pathname !== '/list';

  return (
    <div className="mx-auto flex min-h-full max-w-app flex-col bg-cream lg:max-w-none lg:flex-row">
      <SideNav />
      <div className="flex min-h-full min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-24 pt-4 lg:max-w-4xl lg:px-8 lg:pb-10">
          <Outlet />
        </main>
        <InstallPrompt />
      </div>
      {showShoppingAside && (
        <aside
          aria-label="Einkaufsliste"
          className="sticky top-0 hidden h-screen w-[23rem] shrink-0 overflow-y-auto border-l border-slate-200 bg-white/40 px-5 py-6 xl:w-[26rem] lg:block"
        >
          <ShoppingListView />
        </aside>
      )}
      <BottomNav />
    </div>
  );
}
