import { NavLink } from 'react-router-dom';

type Tab = {
  to: string;
  label: string;
  icon: string; // Emoji als leichtgewichtiges, markenfreies Icon (Feinschliff in M12)
};

const TABS: Tab[] = [
  { to: '/plan', label: 'Plan', icon: '🗓️' },
  { to: '/list', label: 'Liste', icon: '🛒' },
  { to: '/favorites', label: 'Favoriten', icon: '⭐' },
  { to: '/settings', label: 'Einstellungen', icon: '⚙️' },
];

export default function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-app border-t border-slate-200 bg-white/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Hauptnavigation"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `nav-item transition-colors ${
              isActive ? 'text-brand-600' : 'text-slate-400 hover:text-slate-600'
            }`
          }
        >
          <span className="text-xl" aria-hidden>
            {tab.icon}
          </span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
