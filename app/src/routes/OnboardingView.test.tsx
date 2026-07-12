import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import OnboardingView from './OnboardingView';
import { db } from '../db/db';
import { usePrefsStore } from '../state/prefsStore';

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={['/onboarding']}>
      <OnboardingView />
    </MemoryRouter>,
  );
}

describe('OnboardingView', () => {
  it('speichert Prefs und markiert Onboarding als abgeschlossen', async () => {
    const user = userEvent.setup();
    await usePrefsStore.getState().load();
    renderWizard();

    // Schritt 1: Personen von 2 auf 3 erhöhen.
    await user.click(screen.getByRole('button', { name: 'Personenzahl erhöhen' }));

    // Durch alle Schritte klicken.
    for (let i = 0; i < 6; i++) {
      await user.click(screen.getByRole('button', { name: 'Weiter' }));
    }
    await user.click(screen.getByRole('button', { name: 'Fertig' }));

    const saved = await db.preferences.get(1);
    expect(saved?.onboardingComplete).toBe(true);
    expect(saved?.numberOfPeople).toBe(3);
  });

  it('Überspringen markiert Onboarding als abgeschlossen ohne alle Schritte', async () => {
    const user = userEvent.setup();
    await usePrefsStore.getState().load();
    renderWizard();

    await user.click(screen.getByRole('button', { name: /überspringen/i }));

    const saved = await db.preferences.get(1);
    expect(saved?.onboardingComplete).toBe(true);
  });

  it('wählt eine Ernährungsform aus und persistiert sie', async () => {
    const user = userEvent.setup();
    await usePrefsStore.getState().load();
    renderWizard();

    // zu Schritt 3 (Ernährungsform, index 2) navigieren.
    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    await user.click(screen.getByRole('radio', { name: 'Vegan' }));

    // Restliche Schritte + Fertig.
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name: 'Weiter' }));
    }
    await user.click(screen.getByRole('button', { name: 'Fertig' }));

    const saved = await db.preferences.get(1);
    expect(saved?.diet).toBe('vegan');
  });
});
