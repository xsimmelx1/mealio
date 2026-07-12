import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import PlanView from './routes/PlanView';
import ShoppingListView from './routes/ShoppingListView';
import FavoritesView from './routes/FavoritesView';
import SettingsView from './routes/SettingsView';
import RecipeDetailView from './routes/RecipeDetailView';
import OnboardingView from './routes/OnboardingView';

export default function App() {
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
