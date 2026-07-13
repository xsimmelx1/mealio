import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import ShoppingListView from './ShoppingListView';
import { db } from '../db/db';
import type { MealPlan, Recipe } from '../domain/schema';
import { usePlanStore } from '../state/planStore';
import { usePrefsStore } from '../state/prefsStore';
import { useShoppingStore } from '../state/shoppingStore';

const catalog: Recipe[] = [
  {
    id: 'A',
    title: 'Hähnchen-Reis',
    mealStyles: [],
    mealTypes: ['abendessen'],
    dietTags: ['omnivor'],
    requiredAppliances: ['herd'],
    prepMinutes: 5,
    cookMinutes: 10,
    baseServings: 2,
    ingredients: [
      { name: 'Hähnchenbrust', amount: 300, unit: 'g', aisle: 'fleisch-fisch' },
      { name: 'Reis', amount: 150, unit: 'g', aisle: 'trockenwaren' },
    ],
    steps: ['a', 'b', 'c'],
    nutritionPerServing: null,
    estimatedCostPerServing: null,
    source: 'seed',
    isFavorite: false,
    createdAt: 0,
  },
];

const plan: MealPlan = {
  id: 'plan-test',
  weekStartDate: '2026-07-06',
  entries: [{ dayOfWeek: 0, mealType: 'abendessen', recipeId: 'A' }],
};

function renderList() {
  return render(
    <MemoryRouter initialEntries={['/list']}>
      <ShoppingListView />
    </MemoryRouter>,
  );
}

describe('ShoppingListView (Integration)', () => {
  beforeEach(async () => {
    await usePrefsStore.getState().load();
    usePlanStore.setState({ plan, catalog, status: 'ready', error: null });
    useShoppingStore.setState({ items: [], showPantry: true });
  });

  // Anzeigenamen stammen aus den echten Seed-Preis-Labels (z. B. "Hähnchenbrustfilet",
  // "Langkornreis"), daher hier Teilstring-/Regex-Matching.
  it('aggregiert Positionen und gruppiert nach Gang', async () => {
    renderList();
    expect(await screen.findByText(/hähnchen/i)).toBeInTheDocument();
    expect(screen.getByText(/langkornreis/i)).toBeInTheDocument();
    expect(screen.getByText(/fleisch & fisch/i)).toBeInTheDocument();
    expect(screen.getByText(/trockenwaren/i)).toBeInTheDocument();
  });

  it('hakt eine Position ab und persistiert', async () => {
    const user = userEvent.setup();
    renderList();
    const checkbox = await screen.findByRole('checkbox', { name: /hähnchen.*abhaken/i });
    await user.click(checkbox);
    await waitFor(async () => {
      const items = await db.shoppingItems.toArray();
      expect(items.find((i) => /hähnchen/i.test(i.name))?.isChecked).toBe(true);
    });
  });

  it('blendet Vorrats-Positionen aus', async () => {
    const user = userEvent.setup();
    renderList();
    const reisText = await screen.findByText(/langkornreis/i);
    const reisRow = reisText.closest('li') as HTMLElement;
    await user.click(within(reisRow).getByRole('button', { name: 'hab ich' }));
    await user.click(screen.getByRole('button', { name: /vorrat ausblenden/i }));
    await waitFor(() => expect(screen.queryByText(/langkornreis/i)).not.toBeInTheDocument());
  });
});
