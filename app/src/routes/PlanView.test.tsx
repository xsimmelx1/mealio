import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import PlanView from './PlanView';
import { seedDatabase } from '../db/seed';
import { usePrefsStore } from '../state/prefsStore';
import { usePlanStore } from '../state/planStore';

function renderPlan() {
  return render(
    <MemoryRouter initialEntries={['/plan']}>
      <Routes>
        <Route path="/plan" element={<PlanView />} />
        <Route path="/recipe/:id" element={<div>Detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlanView (Integration)', () => {
  beforeEach(async () => {
    await seedDatabase(0);
    await usePrefsStore.getState().load();
    // Plan-Store zurücksetzen (Singleton über Tests hinweg).
    usePlanStore.setState({ plan: null, catalog: [], status: 'idle', error: null });
  });

  it('generiert einen Plan mit 7 Tageskarten und zeigt geschätzte Kosten', async () => {
    const user = userEvent.setup();
    renderPlan();

    await user.click(await screen.findByRole('button', { name: /plan generieren/i }));

    // 7 Wochentage sichtbar.
    expect(await screen.findByText('Montag')).toBeInTheDocument();
    expect(screen.getByText('Sonntag')).toBeInTheDocument();

    // Kosten-Übersicht mit Schätzwert-Kennzeichnung.
    expect(screen.getByText(/geschätzte wochenkosten/i)).toBeInTheDocument();
    expect(screen.getAllByText(/geschätzt/i).length).toBeGreaterThan(0);

    // Persistiert in Dexie.
    const state = usePlanStore.getState();
    expect(state.plan?.entries).toHaveLength(7);
  });

  it('würfelt einen einzelnen Slot neu (Montag Abendessen)', async () => {
    const user = userEvent.setup();
    renderPlan();
    await user.click(await screen.findByRole('button', { name: /plan generieren/i }));
    await screen.findByText('Montag');

    const before = usePlanStore.getState().plan?.entries.find((e) => e.dayOfWeek === 0)?.recipeId;
    // Slot-Shuffle-Button für Tag 0 (Montag) Abendessen.
    await user.click(screen.getByRole('button', { name: /abendessen am 0 neu würfeln/i }));

    const after = usePlanStore.getState().plan?.entries.find((e) => e.dayOfWeek === 0)?.recipeId;
    expect(after).not.toBe(before);
  });
});
