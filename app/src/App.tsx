import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import PlanView from './routes/PlanView';
import ShoppingListView from './routes/ShoppingListView';
import FavoritesView from './routes/FavoritesView';
import SettingsView from './routes/SettingsView';
import RecipeDetailView from './routes/RecipeDetailView';
import OnboardingView from './routes/OnboardingView';
import { useInitDb } from './db/useInitDb';

export default function App() {
  const { ready, error } = useInitDb();

  if (error) {
    return (
      <div className="mx-auto flex min-h-full max-w-app flex-col items-center justify-center gap-3 bg-cream px-6 text-center">
        <div className="text-4xl">😞</div>
        <h1 className="text-lg font-semibold text-brand-800">Daten konnten nicht geladen werden</h1>
        <p className="text-sm text-brand-900/70">{error.message}</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="mx-auto flex min-h-full max-w-app flex-col items-center justify-center gap-3 bg-cream px-6 text-center">
        <div className="animate-pulse text-4xl">🍽️</div>
        <p className="text-sm text-brand-900/70">Mealio wird geladen …</p>
      </div>
    );
  }

  return (
    <Routes>
      {/* Onboarding lebt außerhalb des Tab-Layouts (Vollbild-Wizard) */}
      <Route path="/onboarding" element={<OnboardingView />} />

      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/plan" replace />} />
        <Route path="/plan" element={<PlanView />} />
        <Route path="/recipe/:recipeId" element={<RecipeDetailView />} />
        <Route path="/list" element={<ShoppingListView />} />
        <Route path="/favorites" element={<FavoritesView />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="*" element={<Navigate to="/plan" replace />} />
      </Route>
    </Routes>
  );
}
