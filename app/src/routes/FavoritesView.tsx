import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';

export default function FavoritesView() {
  return (
    <div>
      <ScreenHeader title="Favoriten" subtitle="Deine gespeicherten Rezepte" />
      <EmptyState
        icon="⭐"
        title="Noch keine Favoriten"
        description="Markiere Rezepte als Favorit — sie werden künftig bevorzugt in Pläne gezogen."
      />
    </div>
  );
}
