import { useNavigate, useParams } from 'react-router-dom';
import ScreenHeader from '../components/ScreenHeader';
import EmptyState from '../components/EmptyState';

export default function RecipeDetailView() {
  const { recipeId } = useParams();
  const navigate = useNavigate();

  return (
    <div>
      <ScreenHeader
        title="Rezept"
        action={
          <button
            onClick={() => navigate(-1)}
            className="rounded-full px-3 py-1 text-sm text-brand-600 hover:bg-brand-50"
          >
            Zurück
          </button>
        }
      />
      <EmptyState
        icon="📖"
        title="Rezept-Detail folgt"
        description={`Ab Milestone 7: Zeiten, skalierbare Portionen, Makros und Schritte für Rezept „${recipeId}".`}
      />
    </div>
  );
}
