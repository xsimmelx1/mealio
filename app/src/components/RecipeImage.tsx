import { useState } from 'react';
import type { MealType } from '../domain/enums';
import type { Recipe } from '../domain/schema';

type RecipeLike = Pick<Recipe, 'title' | 'imageUrl' | 'mealTypes' | 'dietTags'>;

/** Wählt ein passendes Emoji für den Platzhalter (kein echtes Foto vorhanden). */
function placeholderEmoji(recipe: RecipeLike): string {
  const t = recipe.title.toLowerCase();
  if (recipe.mealTypes.includes('fruehstueck' as MealType)) return '🍳';
  if (/dessert|kuchen|pancake|waffel|muffin|creme/.test(t)) return '🍰';
  if (/pasta|nudel|spaghetti|penne|lasagne/.test(t)) return '🍝';
  if (/suppe|eintopf|curry|dal|chili/.test(t)) return '🍲';
  if (/salat|bowl/.test(t)) return '🥗';
  if (/pizza/.test(t)) return '🍕';
  if (/burger|wrap|sandwich|döner|toast/.test(t)) return '🥪';
  if (recipe.dietTags.includes('vegan') || recipe.dietTags.includes('vegetarisch')) return '🥗';
  return '🍽️';
}

/**
 * Rezeptbild: echtes Foto bei `imageUrl` (z. B. TheMealDB, mit onError-Fallback),
 * sonst ein Platzhalter aus Farbverlauf + Emoji. `aspect` steuert das Seitenverhältnis.
 */
export default function RecipeImage({
  recipe,
  className = '',
  aspect = 'aspect-[16/9]',
}: {
  recipe: RecipeLike;
  className?: string;
  aspect?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = recipe.imageUrl && !failed;

  if (showImage) {
    return (
      <img
        src={recipe.imageUrl}
        alt={recipe.title}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`w-full ${aspect} rounded-card object-cover ${className}`}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={`flex w-full ${aspect} items-center justify-center rounded-card bg-gradient-to-br from-brand-100 to-brand-300 text-4xl ${className}`}
    >
      {placeholderEmoji(recipe)}
    </div>
  );
}
