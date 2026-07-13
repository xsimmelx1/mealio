import { NavLink } from 'react-router-dom';
import { NAV_TABS } from './navTabs';

/** Desktop-Seitennavigation (ab lg sichtbar). Auf Mobil ausgeblendet — dort greift BottomNav. */
export default function SideNav() {
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-white/70 px-3 py-6 lg:flex">
      <div className="mb-6 px-3 text-xl font-bold text-brand-600">🍽️ Mealio</div>
      <nav className="flex flex-col gap-1" aria-label="Seitennavigation">
        {NAV_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`
            }
          >
            <span className="text-lg" aria-hidden>
              {tab.icon}
            </span>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
