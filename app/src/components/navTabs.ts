/** Gemeinsame Navigationsziele für Bottom-Nav (mobil) und Side-Nav (Desktop). */
export type NavTab = {
  to: string;
  label: string;
  icon: string; // Emoji als leichtgewichtiges, markenfreies Icon
};

export const NAV_TABS: NavTab[] = [
  { to: '/plan', label: 'Plan', icon: '🗓️' },
  { to: '/compare', label: 'Vergleich', icon: '⚖️' },
  { to: '/list', label: 'Liste', icon: '🛒' },
  { to: '/favorites', label: 'Favoriten', icon: '⭐' },
  { to: '/settings', label: 'Einstellungen', icon: '⚙️' },
];
