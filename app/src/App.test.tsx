import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { db } from './db/db';
import { UserPreferencesSchema } from './domain/schema';

/** Prefs mit abgeschlossenem Onboarding in die (fake) DB schreiben. */
async function completeOnboarding() {
  await db.preferences.put(UserPreferencesSchema.parse({ onboardingComplete: true }));
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App shell', () => {
  describe('mit abgeschlossenem Onboarding', () => {
    beforeEach(async () => {
      await completeOnboarding();
    });

    it('rendert die Bottom-Nav mit allen Tabs', async () => {
      renderAt('/plan');
      const nav = await screen.findByRole('navigation', { name: /hauptnavigation/i });
      expect(within(nav).getByText('Plan')).toBeInTheDocument();
      expect(within(nav).getByText('Vergleich')).toBeInTheDocument();
      expect(within(nav).getByText('Liste')).toBeInTheDocument();
      expect(within(nav).getByText('Favoriten')).toBeInTheDocument();
      expect(within(nav).getByText('Einstellungen')).toBeInTheDocument();
    });

    it('leitet die Wurzel auf den Wochenplan um', async () => {
      renderAt('/');
      expect(await screen.findByRole('heading', { name: 'Wochenplan' })).toBeInTheDocument();
    });
  });

  it('zeigt Onboarding außerhalb des Tab-Layouts (ohne Bottom-Nav)', async () => {
    renderAt('/onboarding');
    expect(await screen.findByRole('heading', { name: /willkommen bei mealio/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /hauptnavigation/i })).not.toBeInTheDocument();
  });

  it('leitet beim ersten Start (Onboarding offen) auf den Wizard um', async () => {
    // Frische DB -> onboardingComplete=false -> Tab-Routen leiten auf /onboarding.
    renderAt('/plan');
    expect(await screen.findByRole('heading', { name: /willkommen bei mealio/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /hauptnavigation/i })).not.toBeInTheDocument();
  });
});
