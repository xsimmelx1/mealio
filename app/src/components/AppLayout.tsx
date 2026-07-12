import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import OfflineBanner from './OfflineBanner';

/**
 * Mobile-first Shell: zentrierte Spalte (max ~480px), Content scrollt,
 * Bottom-Nav bleibt fixiert. Alle Tab-Screens rendern im <Outlet/>.
 */
export default function AppLayout() {
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
