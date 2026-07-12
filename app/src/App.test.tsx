import { render, screen } from '@testing-library/react';
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

    it('rendert die Bottom-Nav mit allen vier Tabs', async () => {
      renderAt('/plan');
      expect(
        await screen.findByRole('navigation', { name: /hauptnavigation/i }),
      ).toBeInTheDocument();
      expect(screen.getByText('Plan')).toBeInTheDocument();
      expect(screen.getByText('Liste')).toBeInTheDocument();
      expect(screen.getByText('Favoriten')).toBeInTheDocument();
      expect(screen.getByText('Einstellungen')).toBeInTheDocument();
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
