import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import EstimateBadge from '../components/EstimateBadge';
import RecipeImage from '../components/RecipeImage';
import ScreenHeader from '../components/ScreenHeader';
import { MEAL_STYLE_LABELS } from '../domain/enums';
import { db } from '../db/db';
import { toggleFavorite } from '../db/recipeActions';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { ensureRecipeImages } from '../images/recipeImages';
import { formatPrice } from '../pricing';
import { usePriceEngine } from '../pricing/usePriceEngine';
import { usePrefsStore } from '../state/prefsStore';

export default function FavoritesView() {
  const currency = usePrefsStore((s) => s.prefs.currency);
  const engine = usePriceEngine();
  const online = useOnlineStatus();
  // IndexedDB indiziert keine Booleans zuverlässig -> im Speicher filtern.
  const favorites = useLiveQuery(() => db.recipes.filter((r) => r.isFavorite).toArray(), [], []);

  useEffect(() => {
    if (favorites?.length) void ensureRecipeImages(favorites, online);
  }, [favorites, online]);

  return (
    <div>
      <ScreenHeader title="Favoriten" subtitle="Deine gespeicherten Rezepte" />

      {favorites && favorites.length === 0 && (
        <EmptyState
          icon="⭐"
          title="Noch keine Favoriten"
          description="Markiere Rezepte mit ❤️ — sie werden künftig bevorzugt in Pläne gezogen."
        />
      )}

      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {(favorites ?? []).map((recipe) => {
          const cost = engine.recipeCost(recipe);
          return (
            <li key={recipe.id} className="card flex items-center gap-3 p-4">
              <Link to={`/recipe/${recipe.id}`} className="flex min-w-0 flex-1 items-center gap-3 active:opacity-70">
                <div className="h-14 w-14 shrink-0">
                  <RecipeImage recipe={recipe} aspect="aspect-square" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-slate-900">{recipe.title}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                  <span>⏱️ {recipe.prepMinutes + recipe.cookMinutes} Min</span>
                  {cost.matchedCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      · ≈ {formatPrice(cost.perServing, currency)}/Portion
                      <EstimateBadge />
                    </span>
                  )}
                  {recipe.mealStyles.slice(0, 1).map((s) => (
                    <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                      {MEAL_STYLE_LABELS[s]}
                    </span>
                  ))}
                  </div>
                </div>
              </Link>
              <button
                type="button"
                aria-label={`${recipe.title} aus Favoriten entfernen`}
                onClick={() => void toggleFavorite(recipe.id)}
                className="text-2xl active:scale-90"
              >
                ❤️
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
