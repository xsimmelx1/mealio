import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import RecipeDetailView from './RecipeDetailView';
import { db } from '../db/db';
import type { Recipe } from '../domain/schema';
import { usePrefsStore } from '../state/prefsStore';

const testRecipe: Recipe = {
  id: 'r-test',
  title: 'Test-Pfanne',
  mealStyles: ['schnell'],
  dietTags: ['omnivor'],
  requiredAppliances: ['herd'],
  prepMinutes: 5,
  cookMinutes: 10,
  baseServings: 2,
  ingredients: [{ name: 'Hähnchenbrust', amount: 300, unit: 'g', aisle: 'fleisch-fisch' }],
  steps: ['Schritt eins', 'Schritt zwei', 'Schritt drei'],
  nutritionPerServing: { kcal: 500, protein: 40, carbs: 30, fat: 15 },
  estimatedCostPerServing: null,
  source: 'seed',
  isFavorite: false,
  createdAt: 0,
};

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/recipe/r-test']}>
      <Routes>
        <Route path="/recipe/:recipeId" element={<RecipeDetailView />} />
        <Route path="/plan" element={<div>Plan</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RecipeDetailView', () => {
  beforeEach(async () => {
    await db.recipes.put(testRecipe);
    await usePrefsStore.getState().load();
  });

  it('zeigt Titel, Makros und nummerierte Schritte', async () => {
    renderDetail();
    expect(await screen.findByRole('heading', { name: 'Test-Pfanne' })).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument(); // kcal
    expect(screen.getByText('Schritt eins')).toBeInTheDocument();
  });

  it('skaliert Zutatmengen mit den Portionen', async () => {
    const user = userEvent.setup();
    renderDetail();
    await screen.findByText('Test-Pfanne');
    // Startmenge 300 g bei 2 Portionen.
    expect(screen.getByText(/300/)).toBeInTheDocument();
    // Auf 4 Portionen erhöhen -> 600 g.
    await user.click(screen.getByRole('button', { name: 'Portionen erhöhen' }));
    await user.click(screen.getByRole('button', { name: 'Portionen erhöhen' }));
    expect(screen.getByText(/600/)).toBeInTheDocument();
  });

  it('schaltet Favorit um und persistiert', async () => {
    const user = userEvent.setup();
    renderDetail();
    await screen.findByText('Test-Pfanne');
    await user.click(screen.getByRole('button', { name: /zu favoriten hinzufügen/i }));
    // Live-Query aktualisiert -> Button wird "entfernen".
    expect(await screen.findByRole('button', { name: /aus favoriten entfernen/i })).toBeInTheDocument();
    const saved = await db.recipes.get('r-test');
    expect(saved?.isFavorite).toBe(true);
  });
});
