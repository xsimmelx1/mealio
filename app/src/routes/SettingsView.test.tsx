import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import SettingsView from './SettingsView';
import { db } from '../db/db';
import { usePrefsStore } from '../state/prefsStore';

describe('SettingsView', () => {
  beforeEach(async () => {
    await usePrefsStore.getState().load();
  });

  it('zeigt Datenquellen/Attributionen und Disclaimer', async () => {
    render(<SettingsView />);
    expect(screen.getByText(/USDA FoodData Central/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Open Food Facts/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/— Open Prices/i)).toBeInTheDocument();
    expect(screen.getByText(/Wikibooks Cookbook/i)).toBeInTheDocument();
    expect(screen.getByText(/keine medizinische/i)).toBeInTheDocument();
  });

  it('schaltet KI-Rezepte um und persistiert die Präferenz', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);
    await user.click(screen.getByRole('switch', { name: 'KI-Rezepte' }));
    await waitFor(async () => {
      const saved = await db.preferences.get(1);
      expect(saved?.aiRecipesEnabled).toBe(true);
    });
  });

  it('setzt manuelle Preise zurück', async () => {
    const user = userEvent.setup();
    await db.priceOverrides.put({
      productKey: 'reis',
      storeId: 'manuell',
      region: '',
      pricePerPackage: 1,
      basePrice: 1,
      updatedAt: 1,
    });
    render(<SettingsView />);
    await user.click(screen.getByRole('button', { name: /manuelle preise zurücksetzen/i }));
    await waitFor(async () => {
      expect(await db.priceOverrides.count()).toBe(0);
    });
  });
});
