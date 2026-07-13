import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import QuickMealView from './QuickMealView';
import { seedDatabase } from '../db/seed';
import { usePrefsStore } from '../state/prefsStore';

function renderQuick() {
  return render(
    <MemoryRouter initialEntries={['/quick']}>
      <Routes>
        <Route path="/quick" element={<QuickMealView />} />
        <Route path="/recipe/:id" element={<div>Detail</div>} />
        <Route path="/plan" element={<div>Plan</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('QuickMealView (Einzelgericht)', () => {
  beforeEach(async () => {
    await seedDatabase(0);
    await usePrefsStore.getState().load();
  });

  it('schlägt ein Einzelgericht mit Zutaten vor', async () => {
    renderQuick();
    // „anderes"-Button erscheint erst, wenn ein Rezept geladen ist -> guter Warte-Anker.
    expect(await screen.findByRole('button', { name: /anderes/i })).toBeInTheDocument();
    expect(screen.getByText('Zutaten')).toBeInTheDocument();
  });

  it('„anderes" würfelt erneut (bleibt im Einzelgericht-Modus)', async () => {
    const user = userEvent.setup();
    renderQuick();
    const btn = await screen.findByRole('button', { name: /anderes/i });
    await user.click(btn);
    expect(await screen.findByText('Zutaten')).toBeInTheDocument();
  });
});
